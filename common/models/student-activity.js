'use strict';
const moment = require('moment');
const axios = require('axios');
const fs = require('fs');
const {exec, execSync} = require('child_process');
const AWS = require('aws-sdk');
const credentials = new AWS.SharedIniFileCredentials({profile: 'cori'});
AWS.config.region = 'sa-east-1';
AWS.config.credentials = credentials;

const s3 = new AWS.S3();

module.exports = function(Studentactivity) {
  Studentactivity.beforeRemote('create', function(ctx, data, next) {
    const body = ctx.req.body;
    body.createdAt = moment();
    next();
  });

  Studentactivity.checkFiles = async function(id) {
    const Activity = Studentactivity.app.models.Activity;
    const students = Studentactivity.app.models.Student;
    const stActiity = await Studentactivity.findById(id);
    const stu = await students.findById(stActiity.studentId);
    const Act = await Activity.findById(stActiity.activityId);
    try {
      const data = await Promise.all(
        Act.exercises.map(async r => {
          const file = await axios(
            `https://api.github.com/repos/${stu.username}/marvin/contents/` +
              r.file +
              '?access_token=2551f7fdc3e1bfc7f556b888384a7e7657bdf0e1'
          );
          console.log(file.data.path);
          return file.data;
        })
      );
      return data;
    } catch (e) {
      console.log(e);
      const file = e.response.request.path.split('?')[0].split('/');
      const err = new Error();
      err.statusCode = 404;
      err.message = 'file not found ' + file[file.length - 1];
      throw err;
    }
  };

  Studentactivity.remoteMethod('checkFiles', {
    accepts: {
      arg: 'id',
      type: 'string',
      required: true,
    },
    returns: {
      arg: 'events',
      root: true,
    },
    http: {
      path: '/:id/checkFiles',
      verb: 'get',
    },
  });

  Studentactivity.beforeRemote('finish', async function(ctx, data) {
    const id = ctx.req.params.id;
    const stActiity = await Studentactivity.findById(id);
    if (stActiity.finishedAt) {
      const err = new Error();
      err.message = 'atividade já finalizada';
      throw err;
    }
    return;
  });

  Studentactivity.finish = async function(id) {
    const Activity = Studentactivity.app.models.Activity;
    const students = Studentactivity.app.models.Student;
    const courses = Studentactivity.app.models.Course;
    const stActiity = await Studentactivity.findById(id);
    const stu = await students.findById(stActiity.studentId);
    const Act = await Activity.findById(stActiity.activityId);
    const course = await courses.findById(stu.courseId, {include: 'students'});
    const sts = course.toJSON().students;
    let folder;
    let path = Act.exercises[0].file.split('/');
    path = path[0];
    if (await fs.existsSync('/home/ubuntu/activityFiles')) {
      folder = '/home/ubuntu/activityFiles';
    } else {
      folder = '/home/dante/Documents';
    }
    await fs.mkdirSync(`${folder}/${id}`);
    await fs.mkdirSync(`${folder}/${id}/${path}`);
    const files = await Promise.all(
      Act.exercises.map(async r => {
        let path2 = r.file.split('/');
        path2.splice(-1, 1);
        path2 = path2.join('/');
        const exe = await execSync(`mkdir ${folder}/${id}/${path2}`);
        const file = await axios(
          `https://api.github.com/repos/${stu.username}/marvin/contents/` +
            r.file +
            '?access_token=2551f7fdc3e1bfc7f556b888384a7e7657bdf0e1'
        );
        fs.writeFileSync(
          `${folder}/${id}/${r.file}`,
          file.data.content,
          'base64',
          function(err) {
            console.log('File created', err);
          }
        );
      })
    );
    await execSync(`zip ${folder}/${id}.zip ${folder}/${id}`);
    exec(`rm -rf ${folder}/${id}`);
    const file = await fs.readFileSync(`${folder}/${id}.zip`);
    s3.upload(
      {
        Bucket: 'marvin-files',
        ACL: 'public-read',
        Key: `${id}.zip`,
        Body: file,
      },
      (err, result) => {
        fs.unlinkSync(`${folder}/${id}.zip`);
        console.log(err, result);
      }
    );
    let n = Math.floor(Math.random() * sts.length);
    let corrector;
    while (sts[n].id === stActiity.studentId) {
      n = Math.floor(Math.random() * sts.length);
    }
    console.log(sts[n]);
    stActiity.correctorId = sts[n].id;
    stActiity.finishedAt = moment();
    // stActiity.save();
    return {
      filesURL: `https://s3-sa-east-1.amazonaws.com/marvin-files/${id}.zip`,
      corrector: sts[n],
    };
  };

  Studentactivity.remoteMethod('finish', {
    accepts: {
      arg: 'id',
      type: 'string',
      required: true,
    },
    returns: {
      arg: 'events',
      root: true,
    },
    http: {
      path: '/:id/finish',
      verb: 'put',
    },
  });
};
