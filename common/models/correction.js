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
    const stuAct = await StudentActivity.findById(data.studentActivityId, {
      include: 'student',
    });
    const student = stuAct.toJSON().student;
    const msg = {
      to: student.email,
      from: {
        email: 'contato@projetomarvin.com',
        name: 'Marvin',
      },
      subject: 'Feedback de correção',
      html: `<p>
      Olá ${
        student.username
      }. Sua correção foi encerrada e o último passo para finalizar a fase é o formulário de feedback.<br>
      <a href= 'https://docs.google.com/forms/d/e/1FAIpQLScLOVYYB-U-2K66sDJvxWQqLh34uiPxKnI-I01YwbHBu8-EEw/viewform?usp=pp_url&entry.805940912=${
        data.id
      }' target='_blank'>Clique aqui</a> para responder.`,
    };
    sgMail.send(msg);
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
    correction.map(lvl => {
      correctionmsg += `fase ${lvl[0].level}:\n`;
      lvl.map(t => {
        correctionmsg += `${t.test}:\n`;
        if (!t.correct) {
          errou = true;
          correctionmsg += 'ERRADO! \n\n';
        } else {
          correctionmsg += 'CERTO! \n\n';
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
      corr,
      Act,
    };
  };

  Correction.afterRemote('finishCorrection', async function(ctx, data) {
    const Student = Correction.app.models.Student;
    const stu = await Student.findById(
      data.corr.toJSON().studentActivity.studentId
    );
    const corrMsg = data.msg.replace(/\n/g, '<br>');
    let finalMsg;
    if (data.grade >= 0.3) {
      finalMsg =
        'Parabéns, você passou de fase! Acesse a plataforma ' +
        ' para ver os próximos desafios.';
    } else {
      finalMsg =
        'Com essa nota você não conseguiu avançar, corrija o ' +
        'que estiver errado e finalize a atividade novamente.';
    }
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
    console.log(msg);
    // sgMail.send(msg);
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
