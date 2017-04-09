// For Local Test
// Node.js 4.3.2
const lambda = require("./index");

const event = {
  "Records": [
    {
      "eventVersion": "2.0",
      "eventSource": "aws:s3",
      "awsRegion": "ap-northeast-1",
      "eventTime": "2017-01-21T13:42:16.379Z",
      "eventName": "ObjectCreated:Copy",
      "userIdentity": {
        "principalId": "AWS:AIDAJIHEOHBL7F3YSJ4JY"
      },
      "requestParameters": {
        "sourceIPAddress": "10.159.116.83"
      },
      "responseElements": {
        "x-amz-request-id": "869B6C3520146781",
        "x-amz-id-2": "sUzCTaXwSWtwPjRo/bJFOKUYE/aS0ApLrL4bgvXgpIRvqjzo140JALTYhfQmH+ok"
      },
      "s3": {
        "s3SchemaVersion": "1.0",
        "configurationId": "f1c42ae6-f374-40cc-a426-00f32600c869",
        "bucket": {
          "name": "jp.co.dreamarts.jcomsurvey",
          "ownerIdentity": {
            "principalId": "A8ODR4QSJVE8B"
          },
          "arn": "arn:aws:s3:::jp.co.dreamarts.jcomsurvey"
        },
        "object": {
          "key": "S3/original/57ef56007ce82efdaa841591",
          "size": 48908,
          "sequencer": "00588365383FF2BE20"
        }
      }
    }
  ]
};

const context = {};

// Lambda 実行
lambda.handler(event, context, (e) => {
  console.log(e);
});


