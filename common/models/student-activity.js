'use strict';
const moment = require('moment');
const axios = require('axios');

module.exports = function(Studentactivity) {
  Studentactivity.beforeRemote('create', function(ctx, data, next) {
    const body = ctx.req.body;
    body.createdAt = moment();
    next();
  });

  Studentactivity.beforeRemote('finish', async function(ctx, data) {
    const Activity = Studentactivity.app.models.Activity;
    const students = Studentactivity.app.models.Student;
    const stActiity = await Studentactivity.findById(ctx.req.params.id);
    const stu = await students.findById(stActiity.studentId);
    const Act = await Activity.findById(stActiity.activityId);
    Promise.all(
      Act.exercises.map(r => {
        const url =
          `https://api.github.com/repos/${stu.username}/marvin/contents/` +
          r.file +
          '?access_token=2551f7fdc3e1bfc7f556b888384a7e7657bdf0e1';
        axios
          .get(url)
          .then(r => console.log(r))
          .catch(err => {
            console.log(err);
            return new Error('not found');
          });
      })
    ).then(r => {
      console.log(r);
      return;
    });
  });

  Studentactivity.finish = async function(id, cb) {
    const Activity = Studentactivity.app.models.Activity;
    const students = Studentactivity.app.models.Student;
    const stActiity = await Studentactivity.findById(id);
    const stu = await students.findById(stActiity.studentId);
    const Act = await Activity.findById(stActiity.activityId);
  };

  Studentactivity.remoteMethod('finish', {
    accepts: {arg: 'id', type: 'string', required: true},
    returns: {arg: 'events', root: true},
    http: {path: '/:id/finish', verb: 'put'},
  });
};
