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
  Studentactivity.checkFiles = async function(id) {
    const Activity = Studentactivity.app.models.Activity;
    const students = Studentactivity.app.models.Student;
    const stActivity = await Studentactivity.findById(id);
    const stu = await students.findById(stActivity.studentId);
    const Act = await Activity.findById(stActivity.activityId);
    try {
      const data = await Promise.all(
        Act.exercises.map(async r => {
          if (r.file[r.file.length - 2] === 'j')
            r.file = r.file.slice(0, -2) + stActivity.language;
          else if (r.file[r.file.length - 1] === '*')
            r.file = r.file.slice(0, -2);
          console.log(r.file);
          const file = await axios(
            `https://api.github.com/repos/${stu.username}/marvin/contents/` +
              r.file +
              '?access_token=' + process.env.GITHUB_TOKEN
          );
          return file.data;
        })
      );
      return data;
    } catch (e) {
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

  async function randomCorrector(actId) {
    const sts = await Studentactivity.findById(actId, {
      include: {student: {course: 'students'}},
    });
    let students = sts.toJSON().student.course.students;
    const prevAct = await Studentactivity.find({
      where: {studentId: sts.studentId},
      order: 'createdAt DESC',
      limit: 2,
    });
    let corrs;
    if (prevAct[1]) {
      corrs = [
        ...sts.prevCorrectors || '',
        prevAct[1].correctorId || '',
        prevAct[1].corrector2Id || '',
      ];
    } else {
      corrs = [...sts.prevCorrectors || ''];
    }

    const currStudent = sts.toJSON().student;
    const list = [];
    const obj = {};
    students = students.filter(item => {
      const id = String(item.id);
      return (
        id !== String(sts.studentId) &&
        !corrs.includes(id) &&
        new Date(item.availableUntil) > new Date()
      );
    });
    let sum = 0;
    students.map(st => {
      let cpoints = 4 - st.correctionPoints;
      if (st.correctionPoints) {
        cpoints = cpoints < 1 ? 0.5 : cpoints ** 2;
      } else {
        cpoints = 10000
      }
      let lvl = 3 - Math.abs(currStudent.activityNumber - st.activityNumber);
      lvl = lvl < 1 ? 0.5 : lvl ** 2;
      list.push({[st.id]: cpoints + lvl});
      sum += cpoints + lvl;
    });
    console.log(list);
    list.map(u => {
      for (var usr in u) {
        if (u.hasOwnProperty(usr)) {
          obj[usr] = u[usr] / sum;
        }
      }
    });
    let sum2 = 0;
    let r = Math.random();
    for (var idx in obj) {
      sum2 += obj[idx];
      if (r <= sum2) return idx;
    }
  }

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

  Studentactivity.finish = async function(id) {
    const Activity = Studentactivity.app.models.Activity;
    const Students = Studentactivity.app.models.Student;
    const courses = Studentactivity.app.models.Course;
    const correction = Studentactivity.app.models.Correction;
    const userId = await randomCorrector(id);
    if (!userId) {
      throw Error('Não há nenum corretor disponível');
    }
    console.log(userId);
    const stActivity = await Studentactivity.findById(id);
    const stu = await Students.findById(stActivity.studentId);
    const Act = await Activity.findById(stActivity.activityId);
    const corrector = await Students.findById(userId);
    const codes = {};
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
          let file = r.file;
          if (stActivity.language) {
            file = file.substring(0, file.length - 2) + stActivity.language;
          }
          path2.splice(-1, 1);
          path2 = path2.join('/');
          await execSync(`mkdir ${folder}/${id}/${path2}`);
          const commits = await axios(
            `https://api.github.com/repos/${stu.username}/marvin/commits` +
              '?access_token=' + process.env.GITHUB_TOKEN
          );
          const files = await axios(
            'https://api.github.com/repos/' +
              stu.username +
              '/marvin/git/trees/' +
              commits.data[0].sha +
              '?recursive=' +
              '1&access_token=' + process.env.GITHUB_TOKEN
          );
          const currentFiles = files.data.tree.filter(obj => {
            return obj.mode === '100644' && obj.path === file;
          });
          await Promise.all(
            currentFiles.map(async f => {
              const fileG = await axios(
                `https://api.github.com/repos/${stu.username}/marvin/contents` +
                  f.path +
                  '?access_token=' + process.env.GITHUB_TOKEN
              );
              await fs.writeFileSync(
                `${folder}/${id}/${f.path}`,
                fileG.data.content,
                'base64'
              );
              codes[file.substring(0, file.length - 3)] = fileG.data.content;
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
    stu.correctionPoints--;''
    stu.availableUntil = 'correction'
    stu.save();
    stActivity.save();
    const corr = await correction.create({
      studentActivityId: id,
      correctorId: userId,
      studentId: stActivity.studentId,
      createdAt: moment().toDate(),
      codes,
    });
    const corrData = {
      studentName: stu.username,
      level: stu.activityNumber,
      correctionId: corr.id,
    };
    corrector.updateAttributes({availableUntil: 'correction'});
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

  Studentactivity.answerCorrectionInvite = async function(req, id, data) {
    const Correction = Studentactivity.app.models.Correction;
    const Notification = Studentactivity.app.models.Notification;
    const Student = Studentactivity.app.models.Student;
    const corr = await Correction.findById(id);
    const stuCorr = await Student.findById(req.accessToken.userId);
    if (!corr) {
      throw 'A outra pessoa cancelou a correção!';
    }
    const curAct = await Studentactivity.findById(corr.studentActivityId); //Dando pau aqui quando cancela correcao
    const stu = await Student.findById(curAct.studentId);
    if (data.answer === 'false') {
      const not = await Notification.findOne({
        where: {targetURL: `/correcao.html?${id}`},
      });
      let newCurAct = {};
      if (!curAct.correction2Id) newCurAct.correctorId = '';
      else newCurAct.correctorId = '0';
      if (!curAct.prevCorrectors)
        newCurAct.prevCorrectors = [corr.correctorId];
      else
        newCurAct.prevCorrectors =  [...curAct.prevCorrectors, corr.correctorId];
      newCurAct.finishedAt = 0;
      await stu.updateAttributes({correctionPoints: stu.correctionPoints + 1});
      console.log('update');
      curAct.updateAttributes(newCurAct, (e, d) => console.log(e, d));
      await Correction.destroyById(id);
      await Notification.destroyById(not.id);
      await stu.updateAttributes({availableUntil: 0});
      await stuCorr.updateAttributes({availableUntil: 0});
    }
    return data;
  };

  Studentactivity.remoteMethod('answerCorrectionInvite', {
    accepts: [
      {
        arg: 'req', type: 'object', http: { source: 'req' }
      },
      {
        arg: 'id', type: 'string', required: true,
      }, {
        arg: 'data', type: 'object', required: false, http: {source: 'body'},
      },
    ],
    returns: {
      arg: 'events',
      root: true,
    },
    http: {
      path: '/:id/answerCorrectionInvite',
      verb: 'put',
    },
  });

  Studentactivity.cancelCorrection = async function(id) {
    const Correction = Studentactivity.app.models.Correction;
    const Notification = Studentactivity.app.models.Notification;
    const Student = Studentactivity.app.models.Student;
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
    const stu = await Student.findById(curAct.studentId);
    const stuCorr = await Student.findById(lastCorr.correctorId);
    stuCorr.updateAttributes({availableUntil: 0});
    stu.updateAttributes({availableUntil: 0});
    Correction.destroyById(lastCorr.id, e => console.log(e));
    Notification.destroyById(not.id, e => console.log(e));
    let newCurAct = {};
    if (!curAct.correction2Id) newCurAct.correctorId = '';
    else newCurAct.corrector2Id = '0';
    if (!curAct.prevCorrectors)
      newCurAct.prevCorrectors = [lastCorr.correctorId];
    else
      newCurAct.prevCorrectors =  [...curAct.prevCorrectors, lastCorr.correctorId];
    newCurAct.finishedAt = 0;
    console.log(newCurAct);
    curAct.updateAttributes(newCurAct, (e, d) => console.log(e, d));
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
