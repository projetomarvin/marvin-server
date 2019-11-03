'use strict';
const moment = require('moment');

module.exports = function(Course) {
  Course.beforeRemote('create', function(ctx, data, next) {
    const body = ctx.req.body;
    body.createdAt = moment();
    next();
  });

  Course.createNew = async (data) => {
    const course = await Course.create({
      name: data.name,
      createdAt: new Date(),
    });
    if (data.clone) {
      const courseAct = await Course.findOne({
        order: 'createdAt DESC',
        include: 'activities',
        skip: 1,
      });
      const acts = courseAct.toJSON();
      acts.activities.forEach(i => {
        course.activities.add(i.id, e => console.log(e));
      });
    }
  };

  Course.remoteMethod('createNew', {
    accepts: {
      arg: 'data',
      type: 'object',
      http: { source: 'body' },
      required: true,
    },
    returns: {
      arg: 'events',
      root: true,
    },
    http: {
      path: '/new',
      verb: 'post',
    },
  });
};
