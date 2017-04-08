const mongodb = require('mongodb');
const async = require('async');
const _ = require('underscore');
const fs = require('fs');
const moment = require('moment-timezone');
const ursa = require('ursa');
const exec = require('child_process').exec;

const utils = require('./utils');

const ObjectId = mongodb.ObjectId;

const COLLECTION = {
  users: 'users',
  venues: 'venues',
  events: 'events',
  groups: 'groups',
  customers: 'customers',
  holdevents: 'holdevents',
  templates: 'surveytemplates',
  questions: 'surveyquestions',
  answers: 'surveyanswers',
};

const timezone = 'Asia/Tokyo';

const keyPrivate = fs.readFileSync('./_key/survey', 'utf8');
const privateKey = ursa.createPrivateKey(keyPrivate);

const DELIMITER = ","; // カンマ
//const DELIMITER = "\n"; // 改行

const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const s3 = {
  bucket: process.env.AWS_BUCKET,
  key: 'S3/files/',
};

// 基本情報フォーマット
const basicinfos = require('./basicinfos');

const gatherQuestions = (db, template, exclude, callback) => {
  if (template.pages) {
    const questions = db.collection(COLLECTION.questions);

    // ページに分割されているので一つの配列にまとめる
    const qs = template.pages.reduce((memo, page) => {
      Array.prototype.push.apply(memo, page.questions);
      return memo;
    }, []);

    // 質問ID => 質問オブジェクト のマップを生成する
    // その際、質問を取得して'view'ならとばす
    const titles = ['id']; // タイトル行
    const type = [null]; // セル形式
    const map = {}; // 質問ID => 質問 マップ
    async.eachSeries(qs, (q, next) => {
      if (q && q._id && !exclude[q._id]) {
        questions.findOne({ _id: q._id }, (err, _q) => {
          if (_q.type !== 'view') {
            const i = titles.length;
            map[_q._id] = { q: _q, i };
            titles.push(_q.exportTitle); // タイトル行
            type.push(_q.type);
            if (_q.otherOn) {
              titles.push('その他');
              type.push(null);
            }
          }
          next(err);
        });
      } else {
        next();
      }
    }, err => {
      const questions = {
        map,
        titles,
        type,
      };
      // params.records = [record];
      callback(err, questions);
    });
  } else {
    callback(null);
  }
};

const gatherEvents = (db, _events, callback) => {
  const events = db.collection(COLLECTION.events);
  const templates = db.collection(COLLECTION.templates);

  const params = { events: {}, templates: {} };

  async.each(_events, (event, next) => {
    if (event && event._id) {
      events.findOne({ _id: event._id }, (err, event) => {
        if (err) {
          next(err);
        } else if (event) {
          params.events[event._id] = event;

          // 3. テンプレートの読み込み
          if (event.surveyTemplate) {
            templates.findOne({ _id: event.surveyTemplate._id }, (err, template) => {
              if (err) {
                next(err);
              } else if (template) {
                params.templates[template._id] = template;
                next(err);
              }
            });
          } else {
            next(err);
          }
        }
      });
    } else {
      next(null);
    }
  }, (err) => {
    callback(err, params);
  });
};

const ownerCond = (cond, group, callback) => {
  if (group && group._id) {
    const ids = [group._id];
    cond.push({ 'owners.ancestors': { $in: ids } });
  }
};

const get = (obj, info) => {
  const { key, encrypted, type } = info;
  if (!key.length) return '';
  const ret = key.reduce((memo, _key) => {
    if (memo === null || memo === undefined) {
      return memo;
    } else {
      return memo[_key];
    }
  }, obj);

  if (ret) {
    if (encrypted) {
      try {
        return privateKey.decrypt(ret, 'base64', 'utf8');
      } catch (err) {
        return ret;
      }
    } else if (type === 'date') {
      if(typeof ret === 'string') {
        return ret;
      } else {
        return moment(ret.getTime()).tz(timezone).format('YYYY/MM/DD HH:mm');
      }
    } else {
      return ret.toString();
    }
  } else {
    return '';
  }

};

// _id しかないフィールドに値をうめる
const fullfill = (db, obj, infos, _cache, callback) => {
  async.each(infos, (info, next) => {

    const coll = db.collection(info[0]);
    const key = info[1];
    obj[key] = obj[key] || {};
    const _id = obj[key]._id;

    const cache = _cache[info[0]] = (_cache[info[0]] || {});
    if (cache[_id]) {
      obj[info[1]] = cache[_id];
      next(null);
    } else {
      coll.findOne({ _id }, (err, result) => {
        if (!err && result) {
          obj[key] = cache[_id] = result;
        }
        next(err);
      });
    }
  }, err => {
    callback(err);
  });
};

function setAnsert(template, answer, map, record) {
  answer.forEach(a => {
    const q = map[a.questionId];
    if (q) {
      record[q.i + 0] = a.values;
      if (q.q && q.q.otherOn) {
        record[q.i + 1] = a.otherValues;
      }
    } else {
      console.log(`[Warning] Question (_id: ${a.questionId}) don't find in Template (_id: ${template._id}). value: ${a.values}`);
    }
  });
}

module.exports = (params, callback) => {

  async.waterfall([
      (next) => {
        params.cond = [{ valid: 1 }]; // 回答検索条件
        next(null, params);
      },
      // 0. 実行ユーザの読み込みと、閲覧範囲条件の設定
      (params, next) => {
        const users = params.db.collection(COLLECTION.users);
        const user = params.user;
        users.findOne({ _id: user._id }, (err, user) => {
          if (err) {
            next(err);
          } else {
            ownerCond(params.cond, user.primaryGroup);
            next(null, params);
          }
        });
      },
      // 1. 対象グループの設定
      (params, next) => {
        const source = params.queue.source;
        ownerCond(params.cond, source.group);
        next(null, params);
      },
      // 2. イベントの読み込みと、閲覧範囲条件の設定
      (params, next) => {
        // イベントは複数かもしれないし、設定されていないかもしれない。
        const source = params.queue.source;
        const _events = source.events || [];
        _events.push(source.event);

        gatherEvents(params.db, _events, (err, { events, templates }) => {
          if (err) {
            next(err);
          } else {
            params.events = events; // _id -> event マップ
            params.templates = templates; // _id -> template マップ


            next(err, params);
          }
        });
      },
      // 3. 回答基本情報の読み込み
      (params, next) => {
        const answers = params.db.collection(COLLECTION.answers);
        const questions = params.db.collection(COLLECTION.questions);

        // タイトル行
        const title = basicinfos.map(info => info.title);
        const records = [title];

        params.basicRecords = records;
        const cache = {};

        // 型情報
        const cellType = basicinfos.map(info => info.type);
        params.basicCellType = cellType;

        const answerEmbeddedinfos = [
          [COLLECTION.events, 'event'],
          [COLLECTION.venues, 'venue'],
          [COLLECTION.groups, 'group'],
          [COLLECTION.groups, 'group_parent'],
          [COLLECTION.customers, 'customer'],
          [COLLECTION.holdevents, 'hold'],
          [COLLECTION.users, 'createdBy'],
        ];

        const cond = [].concat(params.cond);
        const events = _.map(params.events, event => event._id);
        if (0 < events.length) {
          cond.push({ 'event._id': { $in: events } });
        }

        const map = {}; // 質問ID => 質問 マップ

        answers.find({ $and: cond }, (err, cursor) => {
          function processItem(err, src) {
            if (err) {
              next(err);
            } else if (src === null) {
              return next(null, params, map);
            } else {

              // _id しかないオブジェクトの情報を埋める (1)
              fullfill(params.db, src, answerEmbeddedinfos, cache, (err) => {
                if (err) {
                  next(err);
                } else {
                  // group のひとつ上位がエクスポートで必要なのでowner_parentという名前で準備する
                  const ancestors = src.group.ancestors;
                  if (1 < ancestors.length) {
                    const group_parent = ancestors[ancestors.length - 2];
                    src['group_parent'] = { _id: ObjectId(group_parent) };
                  }

                  // _id しかないオブジェクトの情報を埋める (2)
                  fullfill(params.db, src, answerEmbeddedinfos, cache, (err) => {
                    if (err) {
                      next(err);
                    } else {
                      // 基本情報
                      const record = basicinfos.map(info => get(src, info));

                      async.waterfall([
                        (next) => {
                          // 共通質問
                          if (src.fixedAnswer) {
                            async.eachSeries(src.fixedAnswer, (a, next) => {
                              const _id = a.questionId;
                              questions.findOne({ _id }, (err, q) => {
                                if (q && !map[q._id]) {
                                  const i = title.length;
                                  map[q._id] = { q, i };
                                  title.push('custom: ' + i + ' 1');
                                  if (q.otherOn) {
                                    title.push('その他');
                                  }
                                }
                                next(err);
                              });
                            }, err => {
                              setAnsert({}, src.fixedAnswer, map, record);
                              next(err);
                            });
                          } else {
                            next(null);
                          }
                        },
                        (next) => {
                          records.push(record);
                          next(null);
                        },
                      ], err => {
                        setImmediate(() => cursor.nextObject(processItem));
                      });
                    }
                  });
                }
              });
            }
          }

          cursor.nextObject(processItem);
        });
      },
      // 4. ここらで固定質問のタイトル読み込むか。
      (params, map, next) => {
        const questions = params.db.collection(COLLECTION.questions);
        const title = params.basicRecords[0];
        async.eachSeries(_.keys(map), (id, next) => {
          const _id = new ObjectId(id);
          questions.findOne({ _id }, (err, q) => {
            if (q) {
              title[map[id].i] = q.exportTitle;
            }
            next(err);
          });
        }, err => {
          next(err, params, map);
        });
      },
      // 5. 質問の読み込み
      (params, map, next) => {
        params.questions = {}; // テンプレートID -> 質問 マップ
        async.each(params.templates, (template, next) => {
          gatherQuestions(params.db, template, map, (err, questions) => {
            params.questions[template._id] = questions;
            next(err);
          });
        }, (err) => {
          next(err, params);
        });
      },
      // 6. 回答の読み込み
      (params, next) => {
        const answers = params.db.collection(COLLECTION.answers);

        params.eventRecords = {};

        async.eachSeries(params.events, (event, next) => {

          if (!event.surveyTemplate) {
            next(null);
          } else {

            const template = params.templates[event.surveyTemplate._id];

            if (!template) {
              next(null);
            } else {

              const { map, titles, type } = params.questions[template._id];

              // 回答検索条件
              const cond = params.cond.concat(
                { 'event._id': event._id }
              );

              const records = [titles];
              params.eventRecords[event._id] = { event, records, type };

              answers.find({ $and: cond }, (err, cursor) => {
                function processItem(err, src) {
                  if (err) {
                    next(err);
                  } else if (src === null) {
                    return next(null, params);
                  } else {
                    if (src.answer) {
                      const record = [src._id];
                      // 可変部分
                      setAnsert(template, src.answer, map, record);
                      records.push(record);
                    }
                    setImmediate(() => cursor.nextObject(processItem));
                  }
                }

                cursor.nextObject(processItem);
              });
            }

          }
        }, err => {
          next(err, params);
        });
      },
      // 7. XLS 出力
      (params, next) => {
        const source = params.queue.source;
        const eventObj = source.event && params.events[source.event._id];
        let event = eventObj && eventObj.name || '全イベント';
        event = event.replace(/ /g, '_').slice(0, 30);
        const group = source.group && source.group.name || '全グループ';

        // 拡張子は重要。xlsx でないと文字化けするよ。
        const now = moment().tz(timezone).format('YYYYMMDD_HHmm');
        const name = `${event}_${group}_${now}.xlsx`;
        const path = `/tmp/${name}`;
        params.file = { contentType, path };

        const { file, basicRecords, eventRecords, basicCellType } = params;

        const recordsArray = [
          { name: '基本情報', records: basicRecords, type: basicCellType }
        ];
        _.each(eventRecords, info => {
          recordsArray.push(
            { name: info.event.name, records: info.records, type: info.type }
          );
        });

        utils.xlsx({ recordsArray, file, DELIMITER });

        next(null, params);
      },
      // 9. 圧縮＆暗号化
      (params, next) => {
        const source = params.queue.source;

        const { path } = params.file;

        const contentType = 'application/zip';

        const zip = `${path}.zip`;
        params.file = { contentType, path: zip };

        const password = source && source.password;
        const arg = password ? ` -P ${password}` : '';

        const buff = path.split('/');
        const name = buff.pop();
        const cwd = buff.join('/');

        exec(`zip ${zip} ${name} ${arg}`, { cwd }, (err) => {
          if (err) {
            next(err);
          } else {
            fs.unlink(path, (err) => {
              next(err, params);
            });
          }
        });
      },
      // 8. ファイルアップロード＆メタデータ登録
      (params, next) => {
        params.s3 = s3;
        utils.upload(params, (err, params) => {
          if (err) {
            next(err);
          } else {
            const file = _.pick(params.filemeta, ['_id', 'name', 'length']);
            params.output = { file };
            next(err, params);
          }
        });
      },
      // 9. ファイル削除
      (params, next) => {
        fs.unlink(params.file.path, (err) => {
          next(err, params);
        });
      }
    ],
    function(err, params) {
      err && console.log(err);
      callback(err, params);
    }
  );
};

