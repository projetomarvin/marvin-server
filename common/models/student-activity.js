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
  Studentactivity.checkFiles = async function(id) {
    const Activity = Studentactivity.app.models.Activity;
    const students = Studentactivity.app.models.Student;
    const stActivity = await Studentactivity.findById(id);
    const stu = await students.findById(stActivity.studentId);
    const Act = await Activity.findById(stActivity.activityId);
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
    const stActivity = await Studentactivity.findById(id, {include: 'student'});
    const student = stActivity.toJSON().student;
    console.log(student);
    if (stActivity.finishedAt) {
      throw Error('atividade já finalizada');
    } else if (student.correctionPoints <= 0) {
      throw Error('pontos de correção insuficientes');
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
    stu.correctionPoints--;
    stu.save();
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
    const Notification = Studentactivity.app.models.Notification;
    Notification.create({
      studentId: data.corrector.id,
      createdAt: moment().toDate(),
      message: `${data.student.username} te convidou para correção.
        Clique para começar`,
      targetURL: `/correcao.html?${data.correction.id}`,
    });
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

  Studentactivity.cancelCorrection = async function(id) {
    const Correction = Studentactivity.app.models.Correction;
    const Notification = Studentactivity.app.models.Notification;
    const curAct = await Studentactivity.findById(id, {include: 'corrections'});
    let act = JSON.stringify(curAct);
    act = JSON.parse(act);
    const corr = act.corrections.sort((a, b) =>
      new Date(a.createdAt) < new Date(b.createdAt) ? -1 : 1
    );
    const lastCorr = corr[corr.length - 1];
    const not = await Notification.findOne({
      where: {targetURL: `/correcao.html?${lastCorr.id}`},
    });
    console.log(not, lastCorr);
    if (lastCorr.started) {
      const err = new Error();
      err.statusCode = 403;
      err.message = 'correction already started';
      throw err;
    }
    Correction.destroyById(lastCorr.id, e => console.log(e));
    Notification.destroyById(not.id, e => console.log(e));
    curAct.correctorId = undefined;
    curAct.finishedAt = undefined;
    curAct.save();
  };

  Studentactivity.remoteMethod('cancelCorrection', {
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
      path: '/:id/cancelCorrection',
      verb: 'put',
    },
  });

  Studentactivity.redo = async function(id) {
    const Student = Studentactivity.app.models.Student;
    const Act = await Studentactivity.findById(id);
    let act = JSON.stringify(Act);
    act = JSON.parse(act);
    const st = await Student.findById(act.studentId, {
      include: 'studentActivities',
    });
    let stu = JSON.stringify(st);
    stu = JSON.parse(stu);
    const latestAct = stu.studentActivities.sort((a, b) =>
      new Date(a.createdAt) < new Date(b.createdAt) ? -1 : 1
    )[stu.studentActivities.length - 1];
    console.log(stu, latestAct);
    Act.fails = NaN;
    Act.correctorId = undefined;
    Act.finishedAt = undefined;
    Studentactivity.destroyById(latestAct.id);
    st.updateAttributes({activityNumber: st.activityNumber - 1});
    Act.save();
  };

  Studentactivity.afterRemote('redo', (context, remoteMethodOutput, next) => {
    let res = context.res;
    res.redirect('https://app.projetomarvin.com/atividades.html');
  });

  Studentactivity.remoteMethod('redo', {
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
      path: '/:id/redo',
      verb: 'get',
    },
  });
};
