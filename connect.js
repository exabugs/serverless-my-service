const mongodb = require('mongodb');
const async = require('async');

const dbconfig = [
  '10.10.3.11:30011',
  '10.10.4.12:30012',
];

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

exports.handler = (event, context) => {
  connect(dbconfig, (db) => {
    db && console.log(db.s.databaseName);
    return context.succeed();
  });
};


