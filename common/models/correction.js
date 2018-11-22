'use strict';
const moment = require('moment');
const sgMail = require('@sendgrid/mail');

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
};
