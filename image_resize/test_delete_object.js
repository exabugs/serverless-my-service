// For Local Test
// Node.js 4.3.2
const lambda = require("./index");

const event = {
  "Records": [
    {
      "eventVersion": "2.0",
      "eventSource": "aws:s3",
      "awsRegion": "ap-northeast-1",
      "eventTime": "2017-01-21T13:55:25.953Z",
      "eventName": "ObjectRemoved:Delete",
      "userIdentity": {
        "principalId": "AWS:AIDAJIHEOHBL7F3YSJ4JY"
      },
      "requestParameters": {
        "sourceIPAddress": "10.159.116.83"
      },
      "responseElements": {
        "x-amz-request-id": "27A5A8157A0864EA",
        "x-amz-id-2": "RbshoCmGhwel5EMhkS4lqwrVPfIvTCIMpSxAMiAOMAxBXXMzYtEYFIZmGYYESBIa"
      },
      "s3": {
        "s3SchemaVersion": "1.0",
        "configurationId": "86130d44-c7b4-41b4-84f9-d1f18e3bb3e8",
        "bucket": {
          "name": "jp.co.dreamarts.jcomsurvey",
          "ownerIdentity": {
            "principalId": "A8ODR4QSJVE8B"
          },
          "arn": "arn:aws:s3:::jp.co.dreamarts.jcomsurvey"
        },
        "object": {
          "key": "S3/original/57ef56007ce82efdaa841591",
          "sequencer": "005883684DEA503EAC"
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


