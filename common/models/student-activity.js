'use strict';
const moment = require('moment');
const axios = require('axios');
const fs = require('fs');
const {exec, execSync} = require('child_process');
const AWS = require('aws-sdk');
const sgMail = require('@sendgrid/mail');

const sgKey =
  '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';
const credentials = new AWS.SharedIniFileCredentials({profile: 'cori'});
sgMail.setApiKey(sgKey);
AWS.config.region = 'sa-east-1';
AWS.config.credentials = credentials;

const s3 = new AWS.S3();

module.exports = function(Studentactivity) {
  Studentactivity.beforeRemote('create', function(ctx, data, next) {
    const body = ctx.req.body;
    body.createdAt = moment().toDate();
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

  Studentactivity.finish = async function(userId, id) {
    console.log(userId);
    const Activity = Studentactivity.app.models.Activity;
    const students = Studentactivity.app.models.Student;
    const courses = Studentactivity.app.models.Course;
    const correction = Studentactivity.app.models.Correction;
    const stActiity = await Studentactivity.findById(id);
    const stu = await students.findById(stActiity.studentId);
    const Act = await Activity.findById(stActiity.activityId);
    const corrector = await students.findById(userId);
    let folder;
    let path = Act.exercises[0].file.split('/');
    path = path[0];
    if (fs.existsSync('/home/ubuntu/activityFiles')) {
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
    await execSync(`zip -r ${folder}/${id}.zip ${folder}/${id}`);
    await execSync(`rm -rf ${folder}/${id}`);
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
    stActiity.correctorId = userId;
    stActiity.finishedAt = moment().toDate();
    stActiity.save();
    const corr = await correction.create({
      studentActivityId: id,
      correctorId: userId,
      createdAt: moment().toDate(),
    });
    console.log(corr);
    return {
      filesURL: `https://s3-sa-east-1.amazonaws.com/marvin-files/${id}.zip`,
      corrector: corrector,
      correction: corr,
      student: stu,
      activity: stActiity,
    };
  };

  Studentactivity.afterRemote('finish', async function(ctx, data) {
    const msg = {
      to: data.corrector.email,
      from: {
        email: 'contato@projetomarvin.com',
        name: 'Marvin',
      },
      subject: 'Nova correção',
      html: `<p>
      Olá ${data.corrector.username}.
      <br>
      <br>
      Você foi convidado(a) por <b>${data.student.username}</b> para correção.
      <br>
      O link do formulário de correção é <a href="https://docs.google.com/forms/d/e/1FAIpQLSedo-dSfvz8IBYstjStDFcC70YVP13LbHRNkF60KkBM22r4zg/viewform?usp=pp_url&entry.790675438=${
        data.correction.id
      }" target="_blank">esse aqui</a>
       e os arquivos estão disponíveis <a href="https://s3-sa-east-1.amazonaws.com/marvin-files/${
         data.activity.id
       }.zip" target="_blank">aqui</a>`,
    };
    sgMail.send(msg);
  });

  Studentactivity.remoteMethod('finish', {
    accepts: [
      {
        arg: 'userId',
        type: 'string',
        required: true,
      },
      {
        arg: 'id',
        type: 'string',
        required: true,
      },
    ],
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
