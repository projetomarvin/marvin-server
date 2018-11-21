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

  });
};
