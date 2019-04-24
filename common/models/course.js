'use strict';
const moment = require('moment');

module.exports = function(Course) {
  Course.beforeRemote('create', function(ctx, data, next) {
    const body = ctx.req.body;
    body.createdAt = moment();
    next();
  });
};
