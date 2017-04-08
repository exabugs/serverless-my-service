const mongodb = require('mongodb');
const async = require('async');
const _ = require('underscore');

const config = require('./config');


const dbconfig = [
  // '10.10.3.11:30011',
  // '10.10.4.12:30012',
  // '127.0.0.1:27017',
   '10.10.3.195:27017',
];


const queueServerId = 'Lambda';


const COLLECTION = {
  queues: 'queues',
};

const STATUS = {
  TODO: "0",
  DOING: "1",
  DONE: "2",
  FAILED: "3",
  CANCEL: "4",
};

const connect = (addrs, callback) => {
  async.detectSeries(addrs, (addr, next) => {
    const url = 'mongodb://' + addr + '/';
    const options = { connectTimeoutMS: 100 };
    mongodb.MongoClient.connect(url, options, (err, db) => {
      if (err) {
        console.log(err);
        next(false);
      } else {
        db.command({ isMaster: 1 }, (err, result) => {
          next(result && result.ismaster && db);
        });
      }
    });
  }, (db) => {
    callback(db);
  });
};

const within = (date, minutes) => {
  const limit = Date.now() - minutes * 60 * 1000; // minutes 分
  return date && limit < date.getTime();
};

const exec = ({ db, TYPE, job_exec }, callback) => {

  const params = {};

  async.waterfall([
    (next) => {
      params.db = db.db(config.db.survey);

      // create index
      const index = [['type', 1], ['status', 1], ['valid', 1]];
      params.db.createIndex(COLLECTION.queues, index);

      next(null);
    },
    // 1. キューの読み込みとステータス変更
    (next) => {
      const queues = params.db.collection(COLLECTION.queues);
      const status = [STATUS.TODO, STATUS.DOING];
      const cond = { type: TYPE, status: { $in: status }, valid: 1 };
      const sort = [['updatedAt', 'asc']];
      queues.findOne(cond, { sort }, (err, queue) => {
        if (err) {
          next(err);
        } else if (!queue) {
          next({ type: TYPE, output: "No queue. Do Nothing" });
        } else if (queue.status === STATUS.DOING && within(queue.startTime, 5)) {
          next({ type: TYPE, output: "Que job is now doing!!" });
        } else {
          cond._id = queue._id;
          cond.type = queue.type;
          const data = {
            status: STATUS.DOING,
            queueServerId,
            output: {},
            startTime: new Date(),
          };
          queues.updateOne(cond, { $set: data }, (err, result) => {
            if (err) {
              next(err);
            } else {
              queues.findOne({ _id: queue._id }, (err, queue) => {
                if (err) {
                  next(err);
                } else {
                  params.queue = queue;
                  params.user = queue.createdBy;
                  params.owner = queue.owner;
                  next(null);
                }
              });
            }
          });
        }
      });
    },
    // 2. 実際のジョブ処理
    (next) => {
      job_exec(params, (error) => {
        params.error = error;
        next(null);
      });
    },
    // 3. キュー書き戻し
    (next) => {
      const queues = params.db.collection(COLLECTION.queues);
      const data = {
        status: params.err ? STATUS.FAILED : STATUS.DONE,
        endTime: new Date(),
        output: params.output,
      };
      const _id = params.queue._id;
      queues.updateOne({ _id }, { $set: data }, err => {
        if (err) {
          next(err);
        } else {
          queues.findOne({ _id }, (err, queue) => {
            if (err) {
              next(err);
            } else {
              params.queue = queue;
              next(null);
            }
          });
        }
      });
    },
  ], function(err) {
    if (err) {
      if (err.type) {
        log(err, null);
        callback(null);
      } else {
        console.log(err);
        callback(err);
      }
    } else {
      log(params.queue, params.error);
      callback(null);
    }
  });
};

const log = (info, error) => {
  const log = {
    type: info.type,
    error: error,
    output: info.output,
    timestamp: new Date(),
  };
  console.log(JSON.stringify(log));
};

exports.handler = (event, context, callback) => {

  // ジョブのタイプを引数で指定する
  // jobs/ ディレクトリに、その名前で処理を書いておく
  //   const TYPE = process.argv[2];
  const TYPE = 'AnswerOutput';

  if (!TYPE) {
    return context.fail('job key not speified.');
  }

  // ジョブの処理はコレ！
  const job_exec = require('./jobs/' + TYPE);

  connect(dbconfig, db => {
    if (!db) {
      return context.fail('Cant connect DB.');
    } else {
      exec({ db, TYPE, job_exec }, err => {
        // close しないとプロセスが終了しない
        db.close();

        console.log('finished');
        if (err) {
          console.log('fail');
          return context.fail(err);
        } else {
          console.log('succeed');
          return context.succeed();
        }
      });
    }
  });
};
