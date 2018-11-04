'use strict';
const moment = require('moment');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey('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');

module.exports = function(Course) {
  Course.beforeRemote('create', function(ctx, data, next) {
    const body = ctx.req.body;
    body.createdAt = moment();
    next();
  });
};
