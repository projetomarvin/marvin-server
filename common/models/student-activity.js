'use strict';
const moment = require('moment');
const axios = require('axios');
const fs = require('fs');
const {exec, execSync} = require('child_process');
const AWS = require('aws-sdk');
const {google} = require('googleapis');

const GDrive = require('../../drive/index.js');

const credentials = new AWS.SharedIniFileCredentials({profile: 'cori'});

AWS.config.region = 'sa-east-1';
AWS.config.credentials = credentials;

const s3 = new AWS.S3();

module.exports = function(Studentactivity) {
  Studentactivity.checkFiles = async function(id) {
    let stActivity = await Studentactivity.findById(
      id, {
        include: [
          {
            relation: 'activity',
            scope: {
              include: 'exercises',
            },
          },
          {relation: 'student'},
        ],
      },
    );
    stActivity = stActivity.toJSON();
    try {
      const data = await Promise.all(
        stActivity.activity.exercises.map(async r => {
          if (r.path[r.path.length - 2] === 'j')
            r.path = r.path.slice(0, -2) + stActivity.language;
          else if (r.path[r.path.length - 1] === '*')
            r.path = r.path.slice(0, -2);
          console.log(r.path);
          const file = await axios(
            `https://api.github.com/repos/${stActivity.student.username}/marvin/contents/` +
              r.path +
              '?access_token=' + process.env.GITHUB_TOKEN,
          );
          return file.data;
        }),
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

  async function listFiles(auth, id) {
    const drive = google.drive({version: 'v3', auth});
    try {
      const result = await drive.files.list({
        q: `'${id}' in parents and trashed = false`,
        fields: '*',
      });
      return (result.data.files);
    } catch (error) {
      console.log(error);
      return error.errors;
    }
  }

  async function duplicateFile(auth, file) {
    const drive = google.drive({version: 'v3', auth});
    const owner = file.permissions.find(x => x.role == 'owner').emailAddress;
    console.log(owner);
    try {
      const result = await drive.files.copy({
        fileId: file.id,
        requestBody: {
          'name': 'Clone X',
          'parents': [
            '1dJUwJ-BUeENMC1RSmVFasP99o7hX8bS9',
          ],
        },
      });
      return (result.data.files);
    } catch (error) {
      console.log(error);
      return error.errors;
    }
  }

  function valdiateFile(files, fileName) {
    const file = files.find(x => x.name === fileName);
    return file;
  }

  Studentactivity.checkFilesDrive = async (id) => {
    let stActivity = await Studentactivity.findById(
      id, {
        include: ['student', 'activity'],
      },
    );
    stActivity = stActivity.toJSON();
    const folderId = stActivity.student.GDriveURL.slice(39);
    const auth = await GDrive();
    const filesOnFolder = await listFiles(auth, folderId);
    const file = valdiateFile(filesOnFolder, stActivity.activity.excelFileName);
    if (!file) {
      const err = new Error();
      err.statusCode = 404;
      err.message = 'file not found ' + stActivity.activity.excelFileName;
      throw err;
    }
    return file;
  };

  Studentactivity.remoteMethod('checkFilesDrive', {
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
      path: '/:id/excel/checkFiles',
      verb: 'get',
    },
  });

  Studentactivity.beforeRemote('excelFinish', async function(ctx) {
    const id = ctx.req.params.id;
    const stActivity = await Studentactivity.findById(id, {include: 'student'});
    const student = stActivity.toJSON().student;
    if (stActivity.finishedAt) {
      throw Error('atividade já finalizada');
    } else if (student.correctionPoints <= 0) {
      throw Error('pontos de correção insuficientes');
    }
    return;
  });

  Studentactivity.excelFinish = async function(id, fileUrl) {
    console.log(fileUrl);
    const Students = Studentactivity.app.models.Student;
    const correction = Studentactivity.app.models.Correction;
    const userId = await randomCorrector(id);
    if (!userId) {
      throw Error('Não há nenum corretor disponível');
    }
    const stActivity = await Studentactivity.findById(
      id, {
        include: [
          {
            relation: 'activity',
            scope: {
              include: 'exercises',
            },
          },
        ],
      },
    );
    const stu = await Students.findById(stActivity.toJSON().studentId);
    const corrector = await Students.findById(userId);
    const stActChanges = {};
    if (!stActivity.correctorId) stActChanges.correctorId = userId;
    else stActChanges.corrector2Id = userId;
    stActChanges.finishedAt = moment().toDate();
    stActChanges.fileUrl = fileUrl;
    stu.correctionPoints--;
    stu.availableUntil = 'correction';
    stu.save();
    stActivity.updateAttributes(stActChanges);
    const corr = await correction.create({
      studentActivityId: id,
      correctorId: userId,
      studentId: stActivity.studentId,
      createdAt: moment().toDate(),
    });
    corrector.updateAttributes({availableUntil: 'correction'});
    return {
      filesURL: fileUrl,
      corrector: corrector,
      correction: corr,
      student: stu,
      activity: stActivity,
    };
  };

  Studentactivity.afterRemote('excelFinish', async function(ctx, data) {
    const Notification = Studentactivity.app.models.Notification;
    Notification.create({
      studentId: data.corrector.id,
      createdAt: moment().toDate(),
      message: `${data.student.email} te convidou para correção.
        Clique para começar`,
      targetURL: `correcao.html?${data.correction.id}`,
    });
  });

  Studentactivity.remoteMethod('excelFinish', {
    accepts: [
      {
        arg: 'id',
        type: 'string',
        required: true,
      },
      {
        arg: 'fileUrl',
        type: 'string',
        required: true,
      },
    ],
    returns: {
      arg: 'events',
      root: true,
    },
    http: {
      path: '/:id/excel/finish',
      verb: 'put',
    },
  });

  async function randomCorrector(actId) {
    const sts = await Studentactivity.findById(actId, {
      include: {student: {course: 'students'}},
    });
    let students = sts.toJSON().student.course.students;
    const currStudent = sts.toJSON().student;
    // let facilitador = students.find(
    //   (s) => s.username.includes('facilitador'),
    // );

    // if (facilitador &&
    //   facilitador.forcedCorrections.includes(String(currStudent.id))) {
    //   return facilitador.id;
    // } else {
    //   facilitador = {id: ''};
    // }
    const list = [];
    const obj = {};
    students = students.filter(item => {
      const id = String(item.id);
      return (
        id !== String(sts.studentId) &&
        new Date(item.availableUntil) > new Date()
      );
    });
    let sum = 0;
    students.map(st => {
      let cpoints = 4 - st.correctionPoints;
      if (st.correctionPoints) {
        cpoints = cpoints < 1 ? 0.5 : cpoints ** 2;
      } else {
        cpoints = 10000;
      }
      let lvl = 3 - Math.abs(currStudent.activityNumber - st.activityNumber);
      lvl = lvl < 1 ? 0.5 : lvl ** 2;
      list.push({[st.id]: cpoints + lvl});
      sum += cpoints + lvl;
    });
    console.log('possíveis corretores: ', list);
    list.map(u => {
      for (const usr in u) {
        if (u.hasOwnProperty(usr)) {
          obj[usr] = u[usr] / sum;
        }
      }
    });
    let sum2 = 0;
    const r = Math.random();
    for (const idx in obj) {
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
    const Students = Studentactivity.app.models.Student;
    const correction = Studentactivity.app.models.Correction;
    const userId = await randomCorrector(id);
    if (!userId) {
      throw Error('Não há nenum corretor disponível');
    }
    const stActivity = await Studentactivity.findById(
      id, {
        include: [
          {
            relation: 'activity',
            scope: {
              include: 'exercises',
            },
          },
        ],
      },
    );

    const stu = await Students.findById(stActivity.toJSON().studentId);
    const activity = stActivity.toJSON().activity;
    const corrector = await Students.findById(userId);
    const codes = {};
    if (!stActivity.corrector2Id) {
      let folder;
      let path = activity.exercises[0].path.split('/');
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
        activity.exercises.map(async r => {
          let path2 = r.path.split('/');
          let file = r.path;
          if (stActivity.language) {
            file = file.substring(0, file.length - 2) + stActivity.language;
          }
          path2.splice(-1, 1);
          path2 = path2.join('/');
          await execSync(`mkdir ${folder}/${id}/${path2}`);
          const commits = await axios(
            `https://api.github.com/repos/${stu.username}/marvin/commits` +
              '?access_token=' + process.env.GITHUB_TOKEN,
          );
          const files = await axios(
            'https://api.github.com/repos/' +
              stu.username +
              '/marvin/git/trees/' +
              commits.data[0].sha +
              '?recursive=' +
              '1&access_token=' + process.env.GITHUB_TOKEN,
          );
          const currentFiles = files.data.tree.filter(obj => {
            return obj.mode === '100644' && obj.path === file;
          });
          await Promise.all(
            currentFiles.map(async f => {
              const fileG = await axios(
                `https://api.github.com/repos/${stu.username}/marvin/contents` +
                  f.path +
                  '?access_token=' + process.env.GITHUB_TOKEN,
              );
              await fs.writeFileSync(
                `${folder}/${id}/${f.path}`,
                fileG.data.content,
                'base64',
              );
              codes[file.substring(0, file.length - 3)] = fileG.data.content;
              console.log('file created');
            }),
          );
        }),
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
            console.log('erro no s3', 'upload feito');
            resolve();
          },
        );
      });
      await up;
    }
    const stActChanges = {};
    if (!stActivity.correctorId) stActChanges.correctorId = userId;
    else stActChanges.corrector2Id = userId;
    stActChanges.finishedAt = moment().toDate();
    stu.correctionPoints--;
    stu.availableUntil = 'correction';
    stu.save();
    stActivity.updateAttributes(stActChanges);
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
    const curAct = await Studentactivity.findById(corr.studentActivityId); // Dando pau aqui quando cancela correcao
    const stu = await Student.findById(curAct.studentId);
    if (data.answer === 'false') {
      const not = await Notification.findOne({
        where: {targetURL: `/correcao.html?${id}`},
      });
      const newCurAct = {};
      if (!curAct.correction2Id) newCurAct.correctorId = '';
      else newCurAct.correctorId = '0';
      newCurAct.finishedAt = 0;
      await stu.updateAttributes({correctionPoints: stu.correctionPoints + 1});
      console.log('update');
      curAct.updateAttributes(newCurAct, (e, d) => console.log(e, d));
      await Correction.destroyById(id);
      await Notification.destroyById(not.id);
      await stu.updateAttributes({availableUntil: 0});
      await stuCorr.updateAttributes({availableUntil: 0});
      console.log(stuCorr.username + ' REJEITOU A CORREÇÃO');
    }
    return data;
  };

  Studentactivity.remoteMethod('answerCorrectionInvite', {
    accepts: [
      {
        arg: 'req', type: 'object', http: {source: 'req'},
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
      new Date(a.createdAt) < new Date(b.createdAt) ? -1 : 1);
    const lastCorr = corr[corr.length - 1];
    const not = await Notification.findOne({
      where: {targetURL: `/correcao.html?${lastCorr.id}`},
    });
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
    const newCurAct = {};
    if (!curAct.correction2Id) newCurAct.correctorId = '';
    else newCurAct.corrector2Id = '0';
    newCurAct.finishedAt = 0;
    console.log(stu.username + ' CANCELOU A CORREÇÃO');
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

  // Studentactivity.redo = async function(id) {
  //   const Student = Studentactivity.app.models.Student;
  //   const Act = await Studentactivity.findById(id);
  //   let act = JSON.stringify(Act);
  //   act = JSON.parse(act);
  //   const st = await Student.findById(act.studentId, {
  //     include: 'studentActivities',
  //   });
  //   let stu = JSON.stringify(st);
  //   stu = JSON.parse(stu);
  //   const latestAct = stu.studentActivities.sort((a, b) =>
  //     new Date(a.createdAt) < new Date(b.createdAt) ? -1 : 1
  //   )[stu.studentActivities.length - 1];
  //   console.log(stu, latestAct);
  //   Act.fails = NaN;
  //   Act.correctorId = undefined;
  //   Act.finishedAt = undefined;
  //   Studentactivity.destroyById(latestAct.id);
  //   st.updateAttributes({activityNumber: st.activityNumber - 1});
  //   Act.save();
  // };

  // Studentactivity.afterRemote('redo', (context, remoteMethodOutput, next) => {
  //   let res = context.res;
  //   res.redirect('https://app.projetomarvin.com/atividades.html');
  // });

  // Studentactivity.remoteMethod('redo', {
  //   accepts: {
  //     arg: 'id',
  //     type: 'string',
  //     required: true,
  //   },
  //   returns: {
  //     arg: 'events',
  //     root: true,
  //   },
  //   http: {
  //     path: '/:id/redo',
  //     verb: 'get',
  //   },
  // });

  Studentactivity.fix = async (req) => {
    const Course = Studentactivity.app.models.Course;
    const Student = Studentactivity.app.models.Student;
    let st = await Student.findById(req.accessToken.userId,
      {include: {course: 'activities'}});
    st = st.toJSON();
    const act = st.course.activities.find(
      e => e.trail === 'main' && e.levelNumber === st.activityNumber,
    );
    const isExcel = st.course.type === 'excel';
    console.log(act);
    let language;
    if (!isExcel) {
      language = st.activityNumber < 6 ? 'js' : 'html';
    }
    const stAct = await Studentactivity.create({
      createdAt: new Date(),
      language,
      studentId: req.accessToken.userId,
      activityId: act.id,
      fails: 0,
    });
    return stAct;
  };

  Studentactivity.remoteMethod('fix', {
    accepts: {arg: 'req', type: 'object', http: {source: 'req'}},
    returns: {
      arg: 'events',
      root: true,
    },
    http: {
      path: '/fix',
      verb: 'post',
    },
  });
};
