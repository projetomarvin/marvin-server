'use strict';
const axios = require('axios');

module.exports = function(Student) {
  Student.beforeRemote('login', function(ctx, data, next) {
    const body = ctx.req.body;
    console.log(body);
    if (body.user.includes('@')) {
      body.email = body.user;
    } else {
      body.username = body.user;
    }
    next();
  });

  Student.checkRepository = function(username, cb) {
    const url = `https://api.github.com/repos/${username}/marvin?access_token=2551f7fdc3e1bfc7f556b888384a7e7657bdf0e1`;
    console.log(url);
    axios.get(url)
    .then(res => {
      cb(null, res.data);
    })
    .catch(err => {
      cb(err.response.data);
    });
  };

  Student.remoteMethod('checkRepository', {
    accepts: {arg: 'username', type: 'string', required: true},
    returns: {arg: 'events', root: true},
    http: {path: '/checkRepository', verb: 'get'},
  });
};
