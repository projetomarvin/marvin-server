'use strict';
const moment = require('moment');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const fs = require('fs');
const {execSync} = require('child_process');
const check = require('../../tester/index.js');
const dryRun = require('../../tester/singleTest.js');

const sgKey = process.env.SENDGRID_API_KEY;
sgMail.setApiKey(sgKey);

module.exports = function(Correction) {
  Correction.disableRemoteMethodByName('prototype.__get__feedbacks');
  Correction.disableRemoteMethodByName('prototype.__destroy__feedbacks');
  Correction.disableRemoteMethodByName('prototype.__update__feedbacks');

  Correction.beforeRemote('prototype.patchAttributes', function(
    ctx,
    data,
    next
  ) {
    const body = ctx.req.body;
    body.correctedAt = moment().toDate();
    next();
  });

  Correction.afterRemote('prototype.patchAttributes', async function(
    ctx,
    data
  ) {
    const StudentActivity = Correction.app.models.StudentActivity;
    const Student = Correction.app.models.Student;
    const Notification = Correction.app.models.Notification;
    const stuAct = await StudentActivity.findById(
      data.studentActivityId, {
        include: {
          activity: 'exercises'
        }
      });

    const corr = await Correction.findById(data.id);
    const act = stuAct.toJSON().activity;
    const stCorr = await Student.findById(corr.correctorId);
    const prevMsg = await Notification.findOne({
      where: {targetURL: `/correcao.html?${data.id}`},
    });
    if (!act.exercises[0].corrections && !stuAct.corrector2Id && stuAct.correctorId) {
      stuAct.updateAttributes({corrector2Id: 0});
      stCorr.updateAttributes({correctionPoints: stCorr.correctionPoints + 1, availableUntil: 0});
    }
    if (prevMsg) {
      prevMsg.destroy();
    }
  });

  Correction.finishCorrection = async function(id) {
    const correction = await Correction.findById(id, {
      include: 
        {studentActivity: {
          activity: 'exercises',
        },
      },
    });
    const corr = correction.toJSON();
    const levels = corr.studentActivity.activity.exercises.length;
    const file = await axios({
      url: `https://s3-sa-east-1.amazonaws.com/marvin-files/${
        corr.studentActivityId
      }.zip`,
      responseType: 'stream',
    });
    const writeFile = new Promise(resolve => {
      file.data.pipe(
        fs
          .createWriteStream(
            __dirname +
              '/../../../activityFiles/' +
              corr.studentActivity.id +
              '.zip'
          )
          .on('finish', () => {
            resolve();
          })
      );
    });
    await writeFile;
    await execSync(
      'unzip -o ' +
        __dirname +
        '/../../../activityFiles/' +
        corr.studentActivity.id +
        ' -d ' +
        __dirname +
        '/../../../activityFiles/' +
        corr.studentActivity.id
    );
    await execSync(
      'rm ' +
        __dirname +
        '/../../../activityFiles/' +
        corr.studentActivity.id +
        '.zip'
    );
    const correctionTest = await check.runTest(
      corr.studentActivity.activity.exercises,
      corr.studentActivity.id,
      corr.studentActivity.language === 'py'
    );
    await execSync(
      'rm -rf ' + __dirname + '/../../../activityFiles/' + corr.studentActivity.id
    );
    let lastRight = 0;
    let errou = false;
    let correctionmsg = '';
    let autocorrectionCheck = {};
    correctionTest.forEach((lvl, i) => {
      correctionmsg += `Exercício ${lvl[0].level}:\n`;
      const lvlName = `ex0${i}`;
      lvl.forEach(t => {
        correctionmsg += `${t.test}:\n`;
        if (!t.correct) {
          errou = true;
          correctionmsg += 'ERRADO! \n\n';
          autocorrectionCheck[lvlName] = false;
        } else {
          correctionmsg += 'CERTO! \n\n';
          if (autocorrectionCheck[lvlName] !== false) autocorrectionCheck[lvlName] = true;
        }
      });
      if (!errou) {
        lastRight++;
      }
      correctionmsg += '\n';
    });
    await correction.updateAttributes({
      message: correctionmsg,
      grade: lastRight / levels,
      started: false,
    });
    return {
      grade: lastRight / levels,
      corr,
      autocorrectionCheck,
    };
  };

  Correction.afterRemote('finishCorrection', async function(ctx, data) {
    console.log(data.autocorrectionCheck);
    const Student = Correction.app.models.Student;
    const Pdf = Correction.app.models.Pdf;
    const Notification = Correction.app.models.Notification;
    const StudentActivity = Correction.app.models.StudentActivity;
    const corr = data.corr;
    const stuCorr = await Student.findById(data.corr.correctorId);
    const stu = await Student.findById(data.corr.studentId);
    const activity = data.corr.studentActivity.activity;
    const stuAct = data.corr.studentActivity;
    const nextLevel = await Pdf.findOne({
      where: {
        courseId: activity.courseId,
        levelNumber: activity.levelNumber + 1,
      }
    });
    
    let precision = 0;
    const stuChanges = {};
    const stuActChanges = {};
    if (data.corr.cheat) {
      stuActChanges.finishedAt = undefined;
      stuActChanges.correctorId = undefined;
      stuActChanges.fails = stuAct.fails + 1;
    } else if (
      data.grade >= activity.minGrade
    ) {
      stuChanges.activityNumber = activity.levelNumber + 1;
      stuChanges.coins = stu.coins + (50 - 8 * stuAct.fails);
      const language = stu.levelNumber > 6 ? 'html' : 'js';
      StudentActivity.create({
        studentId: stu.id,
        activityId: nextLevel.id,
        createdAt: moment().toDate(),
        fails: 0,
        language,
      });
    } else {
      if (stuAct.prevCorrectors) {
        stuActChanges.prevCorrectors = [...stuAct.precisionCoins, stuAct.correctorId];
      } else {
        stuActChanges.prevCorrectors = [stuAct.correctorId];
      }
      stuActChanges.finishedAt = null;
      stuActChanges.correctorId = null;
      stuActChanges.fails = stuAct.fails + 1;
    }
    for (let i in data.autocorrectionCheck) {
      if (data.autocorrectionCheck[i] === corr[i]) {
        precision += 1 / activity.exercises.length;
      }
    }
    let precisionCoins = 0;
    if (precision > 0.999) {
      precisionCoins = 30
    }

    if (stuActChanges.fails) {
      console.log("err");
      const newStAct = await StudentActivity.findById(stuAct.id);
      newStAct.updateAttributes(stuActChanges);
    }
    stu.updateAttributes({...stuChanges, availableUntil: 0});
    stuCorr.updateAttributes({
      correctionPoints: stuCorr.correctionPoints + 1,
      availableUntil: 0,
      coins: stuCorr.coins + precisionCoins,
    });
    Notification.create({
      studentId: corr.studentActivity.studentId,
      createdAt: moment().toDate(),
      message: `Sua correção terminou e a
       nota final foi ${Math.floor(data.grade * 100)}%.
       Clique para mais detalhes`,
      targetURL: '/detalheNota.html?' + corr.id,
    });
  });

  Correction.remoteMethod('finishCorrection', {
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
      verb: 'post',
    },
  });

  Correction.startCorrection = async function(id) {
    const Student = Correction.app.models.Student;
    const corr = await Correction.findById(id, {include: 'studentActivity'});
    const stu = await Student.findById(corr.toJSON().studentActivity.studentId);
    const stuCorr = await Student.findById(corr.correctorId);
    await stu.updateAttributes({availableUntil: 'correction'});
    await stuCorr.updateAttributes({availableUntil: 'correction'});
    await corr.updateAttributes({ started: true });
  };

  Correction.remoteMethod('startCorrection', {
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
      path: '/:id/start',
      verb: 'post',
    },
  });

  Correction.finishManual = async function(id) {
    const StudentActivity = Correction.app.models.StudentActivity;
    const stAct = await Correction.findById(id, {include: 'studentActivity'});
    const acts = stAct.toJSON();
    if (
      acts.studentActivity.corrector2Id &&
      acts.studentActivity.corrector2Id !== '0'
    ) {
      const corr = await StudentActivity.findById(acts.studentActivity.id, {
        include: 'corrections',
      });
      const ex = corr.toJSON().corrections.reverse();
      const corrs = [ex[0], ex[1]];
      let results = {};
      let cheat;
      corrs.map(c => {
        for (var ex in c) {
          if (ex.match(/ex\d\d/g)) {
            if (c[ex].works === 'Não') results[ex] = c[ex].works;
            else if (results[ex] !== 'Não') {
              results[ex] = c[ex].works;
            }
          }
          if (ex === 'cheat') {
            cheat = true;
          }
        }
      });
      console.log(results);
      let exs = 0;
      let right = 0;
      for (var t in results) {
        exs++;
        if (results[t] === 'Sim') right++;
      }
      return {
        corr,
        acts,
        grade: right / exs,
        cheat,
      };
    }
  };

  Correction.afterRemote('finishManual', async function(ctx, data) {
    console.log(data);
    const Student = Correction.app.models.Student;
    const Notification = Correction.app.models.Notification;
    const StudentActivity = Correction.app.models.StudentActivity;
    const corr = data.corr.toJSON();
    console.log(corr, data.grade);
    const stu = await Student.findById(corr.studentId, {
      include: {course: 'activities'},
    });
    const stuCorr = await Student.findById(corr.corrector2Id);
    const stuAct = await StudentActivity.findById(corr.id);
    const course = stu.toJSON();
    let finalMsg;
    let stuChanges = {availableUntil: 0};
    if (data.cheat) {
      finalMsg =
        '<b>A pessoa que te corrigiu indicou que você burlou as regras' +
        'da correção, seja copiando código ou usando trechos que ' +
        'não conseguiu explicar, portanto sua nota é zero e você ' +
        'terá que refazer a fase</b>';
      stuAct.finishedAt = undefined;
      if (stuAct.prevCorrectors)
        stuAct.prevCorrectors.push(stuAct.correctorId, stuAct.corrector2Id);
      else stuAct.prevCorrectors = [stuAct.correctorId, stuAct.corrector2Id];
      stuAct.correctorId = undefined;
      stuAct.corrector2Id = undefined;
      stuAct.prevCorrectors [corr.correctorId, corr.corrector2Id];
      stuAct.fails++;
    } else if (
      data.grade >= course.course.activities[stu.activityNumber].minGrade
    ) {
      finalMsg =
        'Parabéns, você passou de fase! Acesse a plataforma ' +
        'para ver os próximos desafios.';
      stuChanges.activityNumber = stu.activityNumber + 1;
      stuChanges.coins = stu.coins + (80 - 8 * stuAct.fails);
      StudentActivity.create({
        studentId: stu.id,
        activityId: course.course.activities[stuChanges.activityNumber].id,
        createdAt: moment().toDate(),
        fails: 0,
        language: 'html'
      });
    } else {
      finalMsg =
        'Com essa nota você não conseguiu avançar, corrija o ' +
        'que estiver errado e finalize a atividade novamente.';
      stuAct.finishedAt = undefined;
      stuAct.correctorId = undefined;
      stuAct.corrector2Id = undefined;
      stuAct.prevCorrectors [corr.correctorId, corr.corrector2Id];
      stuAct.fails++;
    }
    stuCorr.correctionPoints++;
    stuCorr.availableUntil = 0;
    stuCorr.save();
    stuAct.save();
    stu.updateAttributes(stuChanges);
    const msg = {
      to: stu.email,
      from: {
        email: 'contato@projetomarvin.com',
        name: 'Marvin',
      },
      subject: 'Seu resultado!!',
      html: `<p>
      Resultado da correção:
      Sua nota final foi ${Math.floor(data.grade * 100)}%.
      ${finalMsg}
      <br>
      O link do arquivo e https://s3-sa-east-1.amazonaws.com/marvin-files/${
        stuAct.id
      }.zip
      </p>`,
    };
    Notification.create({
      studentId: corr.studentId,
      createdAt: moment().toDate(),
      message: `Sua correção terminou e a
       nota final foi ${Math.floor(data.grade * 100)}%.
       Veja seu e-mail para mais detalhes`,
      targetURL: '#',
    });
    sgMail.send(msg);
  });

  Correction.remoteMethod('finishManual', {
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
      path: '/:id/finishManual',
      verb: 'post',
    },
  });

  Correction.owned = async function(id) {
    const corrs = await Correction.find({
      where: {
        and: [
          {grade: {gt: -1}},
          {or: [
            {studentId: id},
            {correctorId: id},
            {correcto2Id: id},
          ]}
        ]
      },
      include: 'studentActivity'
    });
    return corrs;
  };

  Correction.remoteMethod('owned', {
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
      path: '/:id/own',
      verb: 'get',
    },
  });

  Correction.dryRun = async function (fk, {code}) {
    const Exercise = Correction.app.models.Exercise;
    const ex = await Exercise.findById(fk);
    const functionName = /\/([a-z1-9]+?)\./gi.exec(ex.path)[1];
    const result = await dryRun(code, functionName, ex.corrections);

    return result;
  }

  Correction.remoteMethod('dryRun', {
    accepts: [
      { arg: 'fk', type: 'string', required: true },
      { arg: 'code', type: 'object', http: { source: 'body', },  required: true, },
    ],
    returns: { arg: 'events', root: true },
    http: { path: '/:fk/dryRun', verb: 'post' },
  });
};
