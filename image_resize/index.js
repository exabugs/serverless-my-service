'use strict';

/**
 * AWS Lambda
 *
 * function name : image_resize
 *
 * Node.js 4.3.2
 */

const aws = require('aws-sdk');
const im = require('imagemagick');

const CONFIG = 'lambda_resize_config.json';

aws.config.setPromisesDependency(Promise);

const promise = (func, params) => {
  return new Promise((resolve, reject) => {
    func(params, (err, result) => {
      return err ? reject(err) : resolve(result);
    })
  });
};

const resize = (s3, data, key, event, fileInfo) => {
  return new Promise((resolve, reject) => {
    const ContentType = data.ContentType;
    const params = {
      srcData: data.Body,
      format: ContentType.split('/').pop(),
      width: fileInfo.width,
      height: fileInfo.height
    };
    return promise(im.resize, params).then(stdout => {
      const params = {
        Key: [event.key, fileInfo.key, key].join('/'),
        Body: new Buffer(stdout, 'binary'),
        ContentType
      };
      return s3.putObject(params).promise();
    }).then(result => {
      return resolve(result);
    }).catch(err => {
      return reject(err);
    });
  });
};

exports.handler = (event, context, callback) => {
  console.log(JSON.stringify(event));

  const record = event.Records[0];
  const eventName = record.eventName;
  const info = record.s3;

  const Bucket = info.bucket.name;
  const Key = decodeURI(info.object.key);
  const s3 = new aws.S3({params: {Bucket}, apiVersion: '2006-03-01'});

  const baseName = Key.split('/').pop();

  s3.getObject({Key: CONFIG}).promise().then(data => {
    const config = JSON.parse(data.Body);
    // Check Infinite Loop
    const conflict = config.files.filter(fileInfo => {
      return Key.startsWith([config.key, fileInfo.key, null].join('/'))
    });
    if (conflict.length) {
      throw 'ERROR : Source and Destination is same.';
    }
    return config;
  }).then(config => {

    switch (eventName.split(":")[0]) {
      case 'ObjectRemoved':
        // 削除
        return Promise.all(config.files.map(fileInfo => {
          const Key = [config.key, fileInfo.key, baseName].join('/');
          return s3.deleteObject({Key}).promise();
        }));
      case 'ObjectCreated':
        // 追加
        if (!info.object.size) {
          return;
        }
        return s3.getObject({Key: Key}).promise().then(data => {
          return promise(im.identify, {data: data.Body}).then(info => {
            const ContentType = `image/${info.format}`.toLowerCase();
            if (data.ContentType !== ContentType) {
              console.log(`ContentType set to ${ContentType}.`);
              const params = {
                CopySource: [Bucket, Key].join('/'),
                Key,
                ContentType,
                MetadataDirective: 'REPLACE'
              };
              return s3.copyObject(params).promise();
            } else {
              return Promise.all(config.files.map(fileInfo => {
                return resize(s3, data, baseName, config, fileInfo);
              }));
            }
          });
        });
    }
  }).then((result) => {
    return callback(null, result);
  }).catch(err => {
    return callback(err);
  });
};
