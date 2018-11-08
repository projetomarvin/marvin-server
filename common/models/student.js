'use strict';
const axios = require('axios');
const moment = require('moment');

module.exports = function(Student) {
  Student.beforeRemote('login', function(ctx, data, next) {
    const body = ctx.req.body;
    if (body.user.includes('@')) {
      body.email = body.user;
    } else {
      body.username = body.user;
    }
    next();
  });

  Student.checkRepository = function(username, id, cb) {
    const url = `https://api.github.com/repos/${username}/marvin?access_token=2551f7fdc3e1bfc7f556b888384a7e7657bdf0e1`;
    axios
      .get(url)
      .then(res => {
        cb(null, {...res.data, id});
      })
      .catch(err => {
        cb(null, 'not found');
      });
  };

  Student.remoteMethod('checkRepository', {
    accepts: [
      {arg: 'username', type: 'string', required: true},
      {arg: 'id', type: 'string', required: true},
    ],
    returns: {arg: 'events', root: true},
    http: {path: '/:id/checkRepository', verb: 'get'},
  });

  Student.afterRemote('checkRepository', async function(ctx, data, next) {
    const StudentActivity = Student.app.models.StudentActivity;
    const Course = Student.app.models.Course;
    if (data !== 'not found') {
      console.log(data.id, data.owner.login);
      const usr = await Student.findById(data.id);
      const course = await Course.findById(usr.courseId, {include: "activities"});
      const activities = course.toJSON().activities;
      console.log(usr, activities);
      usr.activityNumber = 1;
      usr.username = data.owner.login;
      usr.save();
      StudentActivity.create({studentId: data.id, activityId:  activities[1].id, createdAt: moment().toDate()});
      return;
    }
  });
};
