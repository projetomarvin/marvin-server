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
          if (r.file[r.file.length - 1] === '*') r.file = r.file.slice(0, -2);
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

  Studentactivity.getRandomCorrector = async function(actId) {
    const sts = await Studentactivity.findById(actId, {
      include: {student: {course: 'students'}},
    });
    let students = sts.toJSON().student.course.students;
    students = students.filter((item) => {
      return String(item.id) !== String(sts.studentId);
    });
    console.log(Math.round(Math.random() * (students.length - 1)));
    return students[Math.round(Math.random() * (students.length - 1))];
  };

  Studentactivity.remoteMethod('getRandomCorrector', {
    accepts: {
      arg: 'actId',
      type: 'string',
      required: true,
    },
    returns: {
      arg: 'events',
      root: true,
    },
    http: {
      path: '/:id/randomCorrector',
      verb: 'get',
    },
  });

  Studentactivity.beforeRemote('finish', async function(ctx, data) {
    const id = ctx.req.params.id;
    const stActivity = await Studentactivity.findById(id, {include: 'student'});
    const student = stActivity.toJSON().student;
    if (
      (stActivity.finishedAt && !stActivity.corrector2Id) ||
      (stActivity.corrector2Id && stActivity.corrector2Id != 0)
    ) {
      throw Error('atividade já finalizada');
    } else if (student.correctionPoints <= 0) {
      throw Error('pontos de correção insuficientes');
    }
    return;
  });

  Studentactivity.finish = async function(userId, id) {
    const Activity = Studentactivity.app.models.Activity;
    const students = Studentactivity.app.models.Student;
    const courses = Studentactivity.app.models.Course;
    const correction = Studentactivity.app.models.Correction;
    const stActivity = await Studentactivity.findById(id);
    const stu = await students.findById(stActivity.studentId);
    const Act = await Activity.findById(stActivity.activityId);
    const corrector = await students.findById(userId);
    if (!stActivity.corrector2Id) {
      let folder;
      let path = Act.exercises[0].file.split('/');
      path = path[0];
      if (fs.existsSync('/home/ubuntu/activityFiles')) {
        folder = '/home/ubuntu/activityFiles';
      } else {
        folder = '/home/dante/Documents';
      }
      await execSync(`rm -rf ${folder}/${id}`);
      await fs.mkdirSync(`${folder}/${id}`);
      await fs.mkdirSync(`${folder}/${id}/${path}`);
      await Promise.all(
        Act.exercises.map(async r => {
          let path2 = r.file.split('/');
          path2.splice(-1, 1);
          path2 = path2.join('/');
          await execSync(`mkdir ${folder}/${id}/${path2}`);
          const commits = await axios(
            `https://api.github.com/repos/${stu.username}/marvin/commits` +
              '?access_token=2551f7fdc3e1bfc7f556b888384a7e7657bdf0e1'
          );
          const files = await axios(
            'https://api.github.com/repos/' +
              stu.username +
              '/marvin/git/trees/' +
              commits.data[0].sha +
              '?recursive=' +
              '1&access_token=2551f7fdc3e1bfc7f556b888384a7e7657bdf0e1'
          );
          const currentFiles = files.data.tree.filter(obj => {
            return obj.mode === '100644' && obj.path.includes(path2);
          });
          await Promise.all(
            currentFiles.map(async f => {
              const file = await axios(
                `https://api.github.com/repos/${stu.username}/marvin/contents` +
                  f.path +
                  '?access_token=2551f7fdc3e1bfc7f556b888384a7e7657bdf0e1'
              );
              await fs.writeFileSync(
                `${folder}/${id}/${f.path}`,
                file.data.content,
                'base64'
              );
              console.log('file created');
            })
          );
        })
      );
      await execSync(`zip -r ${folder}/${id}.zip ${folder}/${id}`);
      await execSync(`rm -rf ${folder}/${id}`);
      const file = await fs.readFileSync(`${folder}/${id}.zip`);
      const up = new Promise(resolve => {
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
            resolve();
          }
        );
      });
      await up;
    }
    console.log(stActivity.correctorId, stActivity.corrector2Id);
    if (!stActivity.correctorId) stActivity.correctorId = userId;
    else stActivity.corrector2Id = userId;
    stActivity.finishedAt = moment().toDate();
    stu.correctionPoints--;
    stu.save();
    stActivity.save();
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
      activity: stActivity,
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
    if (!curAct.correction2Id) curAct.correctorId = undefined;
    else curAct.corrector2Id = '0';
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
