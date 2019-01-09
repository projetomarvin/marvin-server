'use strict';
const moment = require('moment');
const sgMail = require('@sendgrid/mail');
const axios = require('axios');
const fs = require('fs');
const {execSync} = require('child_process');
const check = require('../../tester/index.js');

const sgKey =
  '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';
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
    Notification.create({
      studentId: stuAct.studentId,
      createdAt: moment().toDate(),
      message: 'Sua correção terminou, clique para dar o feedback.',
      targetURL: `/feedback.html?${data.id}`,
    });
  });

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
      'unzip ' +
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
    const correction = await check.runTest(Act.exercises, a.studentActivity.id);
    await execSync(
      'rm -rf ' + __dirname + '/../../../activityFiles/' + a.studentActivity.id
    );
    let lastRight = 0;
    let errou = false;
    let correctionmsg = '';
    let correctorAcuracy = [];
    correction.map((lvl, i) => {
      correctionmsg += `fase ${lvl[0].level}:\n`;
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
    const prevMsg = await Notification.findOne({
      where: {targetURL: `/feedback.html?${corr.id}`},
    });
    const corrMsg = data.msg.replace(/\n/g, '<br>');
    const course = stu.toJSON();
    let finalMsg;
    let precision = 0;
    if (data.cheat) {
      finalMsg =
        '<b>A pessoa que te corrigiu indicou que você burlou as regras' +
        'da correção, seja copiando código ou usando trechos que ' +
        'não conseguiu explicar, portanto sua nota é zero e você ' +
        'terá que refazer a fase</b>';
      stuAct.finishedAt = undefined;
      stuAct.correctorId = undefined;
    } else if (data.grade >= 0.3) {
      finalMsg =
        'Parabéns, você passou de fase! Acesse a plataforma ' +
        'para ver os próximos desafios.';
      stu.activityNumber += 1;
      stu.XPPoints += 100 * data.grade;
      StudentActivity.create({
        studentId: stu.id,
        activityId: course.course.activities[stu.activityNumber].id,
        createdAt: moment().toDate(),
      });
    } else {
      finalMsg =
        'Com essa nota você não conseguiu avançar, corrija o ' +
        'que estiver errado e finalize a atividade novamente.';
      stuAct.finishedAt = undefined;
      stuAct.correctorId = undefined;
    }
    for (let i = 0; i < data.correctorAcuracy.length; i++) {
      if (data.correctorAcuracy[i] === corr['ex0' + i].works) {
        precision += 1 / data.correctorAcuracy.length;
      }
    }
    stuCorr.XPPoints += 20 * precision;
    stuCorr.save();
    stuAct.save();
    delete stu.course;
    stu.save();
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
      </p>`,
    };
    Notification.create({
      studentId: corr.studentActivity.studentId,
      createdAt: moment().toDate(),
      message: `Sua correção terminou e a
       nota final foi ${Math.floor(data.grade * 100)}%.
       Veja seu e-mail para mais detalhes`,
      targetURL: '#',
    });
    sgMail.send(msg);
    if (prevMsg) {
      prevMsg.destroy();
    }
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
};
