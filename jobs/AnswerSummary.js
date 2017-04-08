const mongodb = require('mongodb');
const async = require('async');
const _ = require("underscore");

const COLLECTION = {
  summary: 'surveyanswersummaries'
};

const ANSWER_FEEDBACK_AGE_10             = "10代";
const ANSWER_FEEDBACK_AGE_20             = "20代";
const ANSWER_FEEDBACK_AGE_30             = "30代";
const ANSWER_FEEDBACK_AGE_40             = "40代";
const ANSWER_FEEDBACK_AGE_50             = "50代";
const ANSWER_FEEDBACK_AGE_60             = "60代";
const ANSWER_FEEDBACK_AGE_70             = "70代以上";
const ANSWER_FEEDBACK_GENDER_MALE        = "男性";
const ANSWER_FEEDBACK_GENDER_FEMALE      = "女性";
const ANSWER_FEEDBACK_SERVICE_TV         = "TV";
const ANSWER_FEEDBACK_SERVICE_NET        = "NET";
const ANSWER_FEEDBACK_SERVICE_TEL        = "TEL";
const ANSWER_FEEDBACK_SERVICE_POWER      = "電力";
const ANSWER_FEEDBACK_SERVICE_GAS        = "ガス（大阪）";
const ANSWER_FEEDBACK_FOLLOWTYPE_APPOINT = "訪問アポイント";
const ANSWER_FEEDBACK_FOLLOWTYPE_TEL     = "電話連絡";

const createData = (ans, increase) => {
  let data = {
     sum: increase,
     age10: 0,
     age20: 0,
     age30: 0,
     age40: 0,
     age50: 0,
     age60: 0,
     age70: 0,
     genderMale: 0,
     genderFemale: 0,
     serviceTV: 0,
     serviceNET: 0,
     serviceTEL: 0,
     servicePower: 0,
     serviceGas: 0,
     mobileFeature: 0,
     mobileSmart: 0,
     mobileIphone: 0,
     mobileSIM: 0,
     mobileAu: 0,
     followAppoint: 0,
     followTel: 0
  };

  for (s of ans.data.feedback.services) {
    switch (s) {
      case ANSWER_FEEDBACK_SERVICE_TV:
        data.serviceTV = increase;
        break;
      case ANSWER_FEEDBACK_SERVICE_NET:
        data.serviceNET = increase;
        break;
      case ANSWER_FEEDBACK_SERVICE_TEL:
        data.serviceTEL = increase;
        break;
      case ANSWER_FEEDBACK_SERVICE_POWER:
        data.servicePower = increase;
        break;
      case ANSWER_FEEDBACK_SERVICE_GAS:
        data.serviceGas = increase;
        break;
    }
  }

  switch (ans.data.feedback.followType) {
    case ANSWER_FEEDBACK_FOLLOWTYPE_APPOINT:
      data.followAppoint = increase;
      break;
    case ANSWER_FEEDBACK_FOLLOWTYPE_TEL:
      data.followTel = increase;
      break;
  }

  switch (ans.data.feedback.age) {
    case ANSWER_FEEDBACK_AGE_10:
      data.age10 = increase;
      break;
    case ANSWER_FEEDBACK_AGE_20:
      data.age20 = increase;
      break;
    case ANSWER_FEEDBACK_AGE_30:
      data.age30 = increase;
      break;
    case ANSWER_FEEDBACK_AGE_40:
      data.age40 = increase;
      break;
    case ANSWER_FEEDBACK_AGE_50:
      data.age50 = increase;
      break;
    case ANSWER_FEEDBACK_AGE_60:
      data.age60 = increase;
      break;
    case ANSWER_FEEDBACK_AGE_70:
      data.age70 = increase;
      break;
  }

  switch (ans.data.feedback.gender) {
    case ANSWER_FEEDBACK_GENDER_MALE:
      data.genderMale = increase;
      break;
    case ANSWER_FEEDBACK_GENDER_FEMALE:
      data.genderFemale = increase;
      break;
  }

  let feature = 0;
  let smart = 0;
  let iPhone = 0;
  let SIM = 0;
  let au = 0;

  if (ans.data.feedback && ans.data.feedback.mobile) {
    feature  = ans.data.feedback.mobile.feature || 0;
    smart  = ans.data.feedback.mobile.smart || 0;
    iPhone  = ans.data.feedback.mobile.iPhone || 0;
    SIM  = ans.data.feedback.mobile.SIM || 0;
    au  = ans.data.feedback.mobile.au || 0;
  }

  data.mobileFeature = increase === 1 ? feature : -feature;
  data.mobileSmart = increase === 1 ? smart : -smart;
  data.mobileIphone = increase === 1 ? iPhone : -iPhone;
  data.mobileSIM = increase === 1 ? SIM : -SIM;
  data.mobileAu = increase === 1 ? au : -au;

  return data;
};

const updateAnswerSummary =(db, ans, increase, done) => {
  const condition = {
    'event._id': ans.data.event._id,
    'hold._id': ans.data.hold._id,
    'rank': ans.data.feedback.rank
  };

  const incData = createData(ans, increase);
  db.findOne(condition, {}, (err, s) => {
    if (err) {
      return done(err);
    } else {
      if (s) {
        if (s.sum === 0 && increase === -1) {
          console.log("データが不整合:" + s._id);
          done(undefined);
        } else {
          const updateObj = { $inc: incData, $set: { updatedA: new Date()}};
          db.updateOne(condition, updateObj, (err) => {
            console.log("更新サマリー:" + ans.data._id);
            done(err);
          });
        }
      } else {
        if (increase === 1) {
          let insertData = {
            hold: ans.data.hold,
            event: ans.data.event,
            group: ans.data.group,
            createdAt: new Date(),
            updatedAt: new Date(),
            rank: ans.data.feedback.rank,
            valid: 1
          };
          insertData = Object.assign(insertData, incData);
          db.insert(insertData, (err) =>{
            console.log("新規サマリー:" + ans.data._id);
            return done(err);
          });
        } else {
          return done(undefined);
        }
      }
    }
  });
};

module.exports = (params, callback) => {
  async.eachSeries(params.queue.source.answer, (ans, next) => {
    const db = params.db.collection(COLLECTION.summary);
    switch (ans.type) {
      case 'create':
      case 'updateNew':
        updateAnswerSummary(db, ans, 1, next);
        break;
      case 'updateOld':
      case 'deleteOld':
        updateAnswerSummary(db, ans, -1, next);
        break;
      default:
        next(undefined);
        break;
    }
  }, (err) => {
    err && console.log(err);
    callback(err, params);
  });
};