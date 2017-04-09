// For Local Test
// Node.js 4.3.2
const lambda = require("./index");

// const event = {
//   headers: {
//     'X-Hub-Signature': 'sha1=154b3b05dc8689ad3c54224ca6bae5befc897510'
//   },
//   body: JSON.stringify(json)
// };

// ARN - arn:aws:lambda:ap-northeast-1:827955595307:function:jcomsurvey_image_resize


const event = {
  "Records": [
    {
      "eventVersion": "2.0",
      "eventSource": "aws:s3",
      "awsRegion": "ap-northeast-1",
      "eventTime": "2017-01-21T23:32:51.138Z",
      "eventName": "ObjectCreated:Put",
      "userIdentity": {
        "principalId": "AWS:AIDAJIHEOHBL7F3YSJ4JY"
      },
      "requestParameters": {
        "sourceIPAddress": "121.3.65.143"
      },
      "responseElements": {
        "x-amz-request-id": "4F032F6F8677D741",
        "x-amz-id-2": "s0KtsMmUKLjDXyHzjVeq0k20cHQwXPP0TaLaXebXDoT00/sYG5m/BRBsw9aMCMMVgJEYsUQhENU="
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
          "eTag": "593631a9580025a6eb9624149b80a8fd",
          "sequencer": "005883EFA312326DA3"
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
