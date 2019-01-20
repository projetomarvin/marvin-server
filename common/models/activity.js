'use strict';
const moment = require('moment');
const AWS = require('aws-sdk');
const credentials = new AWS.SharedIniFileCredentials({profile: 'cori'});

AWS.config.region = 'sa-east-1';
AWS.config.credentials = credentials;

const s3 = new AWS.S3();
const cloudfront = new AWS.CloudFront();

module.exports = function(Activity) {
  Activity.beforeRemote('create', function(ctx, data, next) {
    const body = ctx.req.body;
    body.createdAt = moment();
    next();
  });

  const uploadFileToS3 = file => {
    return new Promise((resolve, reject) => {
      return s3.upload(
        {
          Bucket: 'app.projetomarvin.com',
          ACL: 'public-read',
          Key: 'assets/pdf/' + file.name,
          Body: file.data,
          ContentType: 'application/pdf',
        },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });
  };

  const invalidate = Key => {
    return new Promise((resolve, reject) => {
      cloudfront.createInvalidation(
        {
          DistributionId: 'E3VBOWG22MUCR0',
          InvalidationBatch: {
            CallerReference: String(moment().unix()),
            Paths: {
              Quantity: 1,
              Items: ['/' + Key],
            },
          },
        },
        function(err, result) {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });
  };

  Activity.upload = async (req, id, cb) => {
    const act = await Activity.findById(id);
    if (!act) cb('Invalid activity!');
    if (!req.files) cb('No files were uploaded.');
    let file = Object.keys(req.files)[0];
    const value = req.files[file];
    file = (file, value);
    if (file.name.split('.')[1] !== 'pdf')
      cb('invalid file type');
    const {Location, ETag, Bucket, Key} = await uploadFileToS3(file);
    try {
      const inv = await invalidate(Key);
    } catch (e) {
      console.log(e);
      if (e) {
        await invalidate('/assets/pdf/*');
        console.log('done');
      }
    }
    let url = 'https://' + Bucket + '/' + Key;
    url = url.replace(/\s/g, '+');
    act.updateAttribute('PDFurl', url, (err, c) => {
      console.log(err, c);
    });
    return {result: 'success', id: Key, Activity: act.id};
  };

  Activity.remoteMethod('upload', {
    accepts: [
      {arg: 'req', type: 'object', http: {source: 'req'}},
      {arg: 'id', type: 'string', required: true},
    ],
    returns: {root: true, type: 'object'},
    http: {path: '/:id/upload', verb: 'post'},
  });
};
