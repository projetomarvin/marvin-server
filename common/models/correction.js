'use strict';
const moment = require('moment');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const fs = require('fs');
const {execSync} = require('child_process');
const check = require('../../tester/index.js');

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
    const Notification = Correction.app.models.Notification;
    const stuAct = await StudentActivity.findById(data.studentActivityId);
    const prevMsg = await Notification.findOne({
      where: {targetURL: `/correcao.html?${data.id}`},
    });
    prevMsg.destroy();
    // Notification.create({
    //   studentId: stuAct.studentId,
    //   createdAt: moment().toDate(),
    //   message: 'Sua correção terminou, clique para dar o feedback.',
    //   targetURL: `/feedback.html?${data.id}`,
    // });
  });

  // Correction.afterRemote('prototype.__create__feedbacks', async function(
  //   ctx,
  //   data
  // ) {
  //   const StudentActivity = Correction.app.models.StudentActivity;
  //   const Activity = Correction.app.models.Activity;
  //   const Notification = Correction.app.models.Notification;
  //   const Student = Correction.app.models.Student;
  //   const corr = await Correction.findById(data.correctionId);
  //   const stAct = await StudentActivity.findById(corr.studentActivityId);
  //   const Act = await Activity.findById(stAct.activityId);
  //   const stCorr = await Student.findById(corr.correctorId);
  //   const stu = await Student.findById(stAct.studentId);
  //   const prevMsg = await Notification.findOne({
  //     where: {targetURL: `/feedback.html?${corr.id}`},
  //   });
  //   if (!Act.exercises[0].tests && !stAct.corrector2Id && stAct.correctorId) {
  //     stAct.updateAttributes({corrector2Id: 0});
  //     stCorr.updateAttributes({correctionPoints: stCorr.correctionPoints + 1});
  //   }
  //   stCorr.correctionPoints++;
  //   stCorr.availableUntil = 0;
  //   stCorr.updateAttributes({
  //     correctionPoints: stCorr.correctionPoints + 1,
  //     availableUntil: 0,
  //   });
  //   stu.updateAttributes({availableUntil: 0});
  //   if (prevMsg) {
  //     prevMsg.destroy();
  //   }
  // });

  Correction.finishCorrection = async function(id) {
    const Activity = Correction.app.models.Activity;
    const corr = await Correction.findById(id, {
      include: 'studentActivity',
    });
    const a = corr.toJSON();
    const Act = await Activity.findById(a.studentActivity.activityId);
    const levels = Act.exercises.length;
    const file = await axios({
      url: `https://s3-sa-east-1.amazonaws.com/marvin-files/${
        a.studentActivity.id
      }.zip`,
      responseType: 'stream',
    });
    const writeFile = new Promise(resolve => {
      file.data.pipe(
        fs
          .createWriteStream(
            __dirname +
              '/../../../activityFiles/' +
              a.studentActivity.id +
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
        a.studentActivity.id +
        ' -d ' +
        __dirname +
        '/../../../activityFiles/' +
        a.studentActivity.id
    );
    await execSync(
      'rm ' +
        __dirname +
        '/../../../activityFiles/' +
        a.studentActivity.id +
        '.zip'
    );
    const correction = await check.runTest(
      Act.exercises,
      a.studentActivity.id,
      a.studentActivity.language === 'py'
    );
    await execSync(
      'rm -rf ' + __dirname + '/../../../activityFiles/' + a.studentActivity.id
    );
    let lastRight = 0;
    let errou = false;
    let correctionmsg = '';
    let correctorAcuracy = [];
    correction.map((lvl, i) => {
      correctionmsg += `Exercício ${lvl[0].level}:\n`;
      lvl.map(t => {
        correctionmsg += `${t.test}:\n`;
        if (!t.correct) {
          errou = true;
          correctionmsg += 'ERRADO! \n\n';
          correctorAcuracy[i] = 'Não';
        } else {
          correctionmsg += 'CERTO! \n\n';
          if (correctorAcuracy[i] !== 'Não') correctorAcuracy[i] = 'Sim';
        }
      });
      if (!errou) {
        lastRight++;
      }
      correctionmsg += '\n';
    });
    corr.message = correctionmsg;
    corr.grade = lastRight / levels;
    corr.started = false;
    corr.save();
    return {
      msg: correctionmsg,
      grade: lastRight / levels,
      cheat: a.cheat,
      corr,
      Act,
      correctorAcuracy,
    };
  };

  Correction.afterRemote('finishCorrection', async function(ctx, data) {
    const Student = Correction.app.models.Student;
    const Notification = Correction.app.models.Notification;
    const StudentActivity = Correction.app.models.StudentActivity;
    const corr = data.corr.toJSON();
    const stu = await Student.findById(corr.studentActivity.studentId, {
      include: {course: 'activities'},
    });
    const stuCorr = await Student.findById(corr.correctorId);
    const stuAct = await StudentActivity.findById(corr.studentActivityId);
    const corrMsg = data.msg.replace(/\n/g, '<br>');
    const course = stu.toJSON();
    let finalMsg;
    let precision = 0;
    let stuChanges = {};
    if (data.cheat) {
      finalMsg =
        '<b>A pessoa que te corrigiu indicou que você burlou as regras' +
        'da correção, seja copiando código ou usando trechos que ' +
        'não conseguiu explicar, portanto sua nota é zero e você ' +
        'terá que refazer a fase</b>';
      stuAct.finishedAt = undefined;
      stuAct.correctorId = undefined;
      stuAct.fails++;
    } else if (
      data.grade >= course.course.activities[stu.activityNumber].minGrade
    ) {
      finalMsg =
        'Parabéns, você passou de fase! Acesse a plataforma ' +
        'para ver os próximos desafios.';
      stuChanges.activityNumber = stu.activityNumber + 1;
      if (stuAct.fails)
        stuChanges.XPPoints =
          stu.XPPoints + (data.grade * 100) / (stuAct.fails + 1);
      else stuChanges.XPPoints = stu.XPPoints + 100 * data.grade;
      StudentActivity.create({
        studentId: stu.id,
        activityId: course.course.activities[stuChanges.activityNumber].id,
        createdAt: moment().toDate(),
        fails: 0,
      });
    } else {
      finalMsg =
        'Com essa nota você não conseguiu avançar, corrija o ' +
        'que estiver errado e finalize a atividade novamente.';
      stuAct.finishedAt = undefined;
      if (stuAct.prevCorrectors) stuAct.prevCorrectors.push(stuAct.correctorId);
      else stuAct.prevCorrectors = [stuAct.correctorId];
      stuAct.correctorId = undefined;
      stuAct.fails++;
    }
    for (let i = 0; i < data.correctorAcuracy.length; i++) {
      if (data.correctorAcuracy[i] === corr['ex0' + i].works) {
        precision += 1 / data.correctorAcuracy.length;
      }
    }
    stuCorr.XPPoints += 20 * precision;
    stuCorr.save();
    stuAct.save();
    console.log(stuChanges);
    stu.updateAttributes({...stuChanges, availableUntil: 0});
    const msg = {
      to: stu.email,
      from: {
        email: 'contato@projetomarvin.com',
        name: 'Marvin',
      },
      subject: 'Seu resultado!!',
      html: `<p>
      Resultado da correção automática:
      <br>
      ${corrMsg}
      Sua nota final foi ${Math.floor(data.grade * 100)}%.
      ${finalMsg}
      <br>
      Acesse o código que foi avaliado em https://s3-sa-east-1.amazonaws.com/marvin-files/${stuAct.id}.zip
      </p>`,
    };
    stuCorr.updateAttributes({
      correctionPoints: stuCorr.correctionPoints + 1,
      availableUntil: 0,
    });
    Notification.create({
      studentId: corr.studentActivity.studentId,
      createdAt: moment().toDate(),
      message: `Sua correção terminou e a
       nota final foi ${Math.floor(data.grade * 100)}%.
       Veja seu e-mail para mais detalhes`,
      targetURL: '/detalheNota.html?' + corr.id,
    });
    sgMail.send(msg);
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
    stu.updateAttributes({availableUntil: 'correction'});
    stuCorr.updateAttributes({availableUntil: 'correction'});
    corr.started = true;
    corr.save();
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
    let stuChanges = {};
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
      stuAct.fails++;
    } else if (
      data.grade >= course.course.activities[stu.activityNumber].minGrade
    ) {
      finalMsg =
        'Parabéns, você passou de fase! Acesse a plataforma ' +
        'para ver os próximos desafios.';
      stuChanges.activityNumber = stu.activityNumber + 1;
      if (stuAct.fails)
        stuChanges.XPPoints =
          stu.XPPoints + (data.grade * 100) / (stuAct.fails + 1);
      else stuChanges.XPPoints = stu.XPPoints + 100 * data.grade;
      StudentActivity.create({
        studentId: stu.id,
        activityId: course.course.activities[stuChanges.activityNumber].id,
        createdAt: moment().toDate(),
        fails: 0,
      });
    } else {
      finalMsg =
        'Com essa nota você não conseguiu avançar, corrija o ' +
        'que estiver errado e finalize a atividade novamente.';
      stuAct.finishedAt = undefined;
      stuAct.correctorId = undefined;
      stuAct.corrector2Id = undefined;
      stuAct.fails++;
    }
    stuCorr.correctionPoints++;
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
    let corrs = await Correction.find({include: 'studentActivity'});
    const filtered = corrs.filter((el, i) => {
      let co = JSON.stringify(el);
      co = JSON.parse(co);
      return co.correctorId === id ||
      (co.studentActivity && co.studentActivity.studentId === id);
    });
    return filtered;
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
};
