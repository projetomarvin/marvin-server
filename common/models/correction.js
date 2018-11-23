'use strict';
const moment = require('moment');
const sgMail = require('@sendgrid/mail');
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
      <a href= 'https://docs.google.com/forms/d/e/1FAIpQLScVHdY9ApN8qkUzgvurvTjWDBDvRsWMmT3QQUIBVlUUUyLeQA/viewform?entry.805940912=${
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
    const Act = await Activity.findById(
      corr.toJSON().studentActivity.activityId
    );
    const levels = Act.exercises.length;
    const correction = await check.runTest(Act.exercises);
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
    console.log(correctionmsg, lastRight);
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
};
