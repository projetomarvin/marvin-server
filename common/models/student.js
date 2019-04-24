'use strict';
const axios = require('axios');
const moment = require('moment');
const sgMail = require('@sendgrid/mail');

const sgKey = process.env.SENDGRID_API_KEY;

module.exports = function(Student) {
  Student.disableRemoteMethodByName('prototype.__get__notifications');
  Student.disableRemoteMethodByName('prototype.__create__notifications');
  Student.disableRemoteMethodByName('prototype.__delete__notifications');
  Student.disableRemoteMethodByName('prototype.__updateById__notifications');
  Student.disableRemoteMethodByName('prototype.__findById__notifications');
  Student.disableRemoteMethodByName('prototype.__count__notifications');
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
    const url = `https://api.github.com/repos/${username}/marvin?access_token=${process.env.GITHUB_TOKEN}`;
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

  Student.afterRemote('checkRepository', async function(ctx, data) {
    const StudentActivity = Student.app.models.StudentActivity;
    const Course = Student.app.models.Course;
    if (data !== 'not found') {
      // console.log(data.id, data.owner.login);
      const usr = await Student.findById(data.id);
      const course = await Course.findById(usr.courseId, {
        include: 'activities',
      });
      if (usr.activityNumber > 0) {
        return;
      }
      const activities = course.toJSON().activities;
      // console.log(usr, activities);
      usr.activityNumber = 1;
      usr.XPPoints = 50;
      usr.username = data.owner.login;
      usr.save();
      StudentActivity.create({
        studentId: data.id,
        activityId: activities[1].id,
        createdAt: moment().toDate(),
        fails: 0,
      });
      return;
    }
  });

  Student.beforeRemote('prototype.patchAttributes', async function(ctx, data, next) {
    if (ctx.req.body.githubAccessToken) {
      axios
        .post('https://github.com/login/oauth/access_token', {
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code: ctx.req.body.githubAccessToken,
        })
        .then(r => {
          const token = r.data.split('=')[1].split('&')[0];
          if (token !== 'bad_verification_code') {
            ctx.req.body.githubAccessToken = token;
            next();
          } else {
            const err = new Error();
            err.status = 500;
            next(err);
          }
        });
    }
    else if (ctx.req.body.availableUntil) {
      const uId = ctx.req.accessToken.userId.toJSON();
      const st = await Student.findById(uId)
      console.log(st);
      if (st.availableUntil === "correction") {
        throw "Você está em uma correção"
      }
    } else {
      next();
    }
  });

  function gitPush(usr, data, sha) {
    axios
      .put(
        `https://api.github.com/repos/${usr.username}/marvin/contents/${
          data.path
        }`,
        {
          content: data.content,
          message: data.message,
          sha,
        },
        {
          headers: {
            Authorization: 'token ' + usr.githubAccessToken,
          },
        }
      )
      .then(r => console.log(r.data))
      .catch(e => console.log('ERROR', e.response.data));
  }

  Student.pushToGit = async function(data, id, cb) {
    const usr = await Student.findById(id);
    return axios(
      `https://api.github.com/repos/${usr.username}/marvin/contents/${
        data.path
      }`,
      {
        headers: {
          Authorization: 'token ' + usr.githubAccessToken,
        },
      }
    )
      .then(r => {
        gitPush(usr, data, r.data.sha)
      })
      .catch(err => {
        if (err.response.status === 404) gitPush(usr, data);
        else if (err.response.status === 401) {
          const error = new Error('Authorization required');
          error.statusCode = 401;
          throw error;
        } else throw err;
      });
  };

  Student.remoteMethod('pushToGit', {
    accepts: [
      {
        arg: 'data',
        type: 'object',
        http: {source: 'body'},
        required: true,
      },
      {
        arg: 'id',
        type: 'string',
        required: true,
      },
    ],
    returns: {root: true},
    description: 'pushes content to saveGithub',
    http: {path: '/:id/pushToGit', verb: 'post'},
  });

  Student.on('resetPasswordRequest', function(info) {
    const token = info.accessToken.id;
    sgMail.setApiKey(sgKey);
    const msg = {
      to: info.email,
      from: 'contato@projetomarvin.com',
      subject: 'Recuperação de senha',
      html: `<p>Olá, você solicitou uma nova senha.<br/>
          <a href=https://app.projetomarvin.com/reset-password.html?${token}>Clique aqui</a> para criar sua nova senha!</p>`,
    };
    console.log(msg);
    sgMail.send(msg);
  });

  Student.getUsername = async function (id) {
    const stu =  await Student.findById(id);
    if (stu) {
      return stu.username;
    } else {
      const err = new Error();
      err.status = 500;
      throw err;
    }
  }

  Student.remoteMethod('getUsername', {
    accepts: [
      {
        arg: 'id',
        type: 'string',
        required: true,
      },
    ],
    returns: {root: true},
    description: 'gets username from id',
    http: {path: '/:id/username', verb: 'get'},
  });
};
