const mongodb = require('mongodb');
const async = require('async');
const _ = require('underscore');
const fs = require('fs');
var path = require('path');

const aws = require('aws-sdk');
const credentialProvider = new aws.CredentialProviderChain();
const cognitoidentity = new aws.CognitoIdentity({ credentialProvider });
const s3 = new aws.S3({ credentialProvider });

const XLSX = require('xlsx');


const ObjectId = mongodb.ObjectId;

const COLLECTION = {
  files: 'filemetas',
};

// パラメータ
//  - user
//  - owner
//  - file
//    - path
//    - contentType
//  - s3
//    - bucket
//    - key
//
// アウトプット
//  - filemeta
const upload = (params, callback) => {

  async.waterfall([
    (next) => {
      next(null, params);
    },
    // 6. メタデータ登録
    (params, next) => {
      const files = params.db.collection(COLLECTION.files);

      const { user, owner, file } = params;
      const now = new Date();
      const stat = fs.statSync(file.path);

      const data = {
        createdAt: now,
        updatedAt: now,
        createdBy: user,
        updatedBy: user,
        owner,
        name: path.basename(file.path),
        contentType: file.contentType,
        length: stat.size,
        valid: 1,
      };
      files.insertOne(data, (err, result) => {
        if (err) {
          next(err);
        } else {
          const _id = result.insertedId;
          files.findOne({ _id }, (err, filemeta) => {
            if (err) {
              next(err);
            } else {
              params.filemeta = filemeta;
              next(err, params);
            }
          });
        }
      });
    },
    // 6. ファイル S3 アップロード
    (params, next) => {
      s3.putObject();
      const info = {
        Bucket: params.s3.bucket,
        Key: `${params.s3.key}${params.filemeta._id}`,
        Body: fs.createReadStream(params.file.path),
        ContentType: params.filemeta.contentType,
      };
      s3.putObject(info, (err) => {
        next(err, params);
      });
    },
  ], (err, params) => {
    err && console.log(err);
    callback(err, params);
  });
};

function zenkakuToHankaku(str) {
  return str.split('').map(s => {
    const code = s.charCodeAt(0);
    return 0xFEE0 < code ? String.fromCharCode(code - 0xFEE0) : s;
  }).join('');
}

const xlsx = ({ recordsArray, file, DELIMITER = ',' }) => {
  /* original data */
//  var data = [[1, 2, 3], [true, false, null, "sheetjs"], ["foo", "bar", "0.3"], ["baz", null, "qux"]]
//  var data = records;
  var { path } = file;

  /* set up workbook objects -- some of these will not be required in the future */
  var wb = {
    Sheets: {},
    Props: {},
    SSF: {},
    SheetNames: [],
  };

  recordsArray.forEach(info => {

    var data = info.records;
    var ws_name = info.name;
    var type = info.type;

    /* create worksheet: */
    var ws = {}

    /* the range object is used to keep track of the range of the sheet */
    var range = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };

    /* Iterate through each element in the structure */
    for (var R = 0; R != data.length; ++R) {
      if (range.e.r < R) range.e.r = R;
      for (var C = 0; C != data[R].length; ++C) {
        if (range.e.c < C) range.e.c = C;

        /* create cell object: .v is the actual data */
        var cell = { v: data[R][C] };
        if (cell.v == null) continue;

        /* determine the cell type */
        // if (typeof cell.v === 'number') cell.t = 'n';
        // else if (typeof cell.v === 'boolean') cell.t = 'b';
        // else cell.t = 's';
        if (0 < R && type && type[C] === 'number') {
          cell.t = 'n';
        } else {
          cell.t = 's';
        }
        if (Array.isArray(cell.v)) {
          cell.v = cell.v.join(DELIMITER)
        }
        // 全角->半角
        if (cell.t === 'n' && cell.v) {
          cell.v = zenkakuToHankaku(cell.v);
        }

        /* create the correct cell reference */
        var cell_ref = XLSX.utils.encode_cell({ c: C, r: R });

        /* add to structure */
        ws[cell_ref] = cell;
      }
    }
    ws['!ref'] = XLSX.utils.encode_range(range);

    /* add worksheet to workbook */
    wb.SheetNames.push(ws_name);
    wb.Sheets[ws_name] = ws;
  });

  /* write file */
  XLSX.writeFile(wb, path);
  //XLSX.writeFile(wb, 'test.xlsx');
};


module.exports = {
  upload,
  xlsx,
};
