'use strict';
const moment = require('moment');
const sgMail = require('@sendgrid/mail');

const sgKey =
  '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';
sgMail.setApiKey(sgKey);

module.exports = function(Correction) {
  Correction.beforeRemote('prototype.patchAttributes', function (ctx, data, next) {
    const body = ctx.req.body;
    body.correctedAt = moment().toDate();
    console.log("done");
    next();
  });

  Correction.afterRemote('prototype.patchAttributes', async function (ctx, data) {
    const students = Correction.app.models.Student;
    const Studentactivity = Correction.app.models.Studentactivity;
    const stu = await Studentactivity.findById(data.StudentactivityId, {
      include: 'students',
    });
    const corr = await students.findById(data.correctorId);
    console.log(stu.email, corr);
    const msg = {
      to: stu.email,
      from: {
        email: 'contato@projetomarvin.com',
        name: 'Marvin',
      },
      subject: 'Feedback de correção',
      html: `<p>`
    }
  });
};
