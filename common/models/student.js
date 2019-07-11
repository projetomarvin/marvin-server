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
    body.ttl = 14400;
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

  Student.linkGithub = async function(token, id) {
    console.log(id, token);
    const student = await Student.findById(id);
    return axios
      .post('https://github.com/login/oauth/access_token', {
        client_id: "71f8116e373c16f3eb11",
        client_secret: "963642187139722787a001456c34002985a9f22c",
        code: token,
      })
      .then(r => {
        const authToken = r.data.split('=')[1].split('&')[0];
        console.log(authToken);
        if (authToken !== 'bad_verification_code') {
          student.updateAttributes({githubAccessToken: authToken})
          return authToken;
        } else {
          const err = new Error();
          err.status = 500;
          return err;
        }
      });
  }

  Student.remoteMethod('linkGithub', {
    accepts: [
      {
        arg: 'token',
        type: 'string',
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
    http: {path: '/:id/linkGithub', verb: 'post'},
  });

  Student.beforeRemote('prototype.patchAttributes', async function(ctx, data) {
     if (ctx.req.body.availableUntil && ctx.req.body.availableUntil !== "available") {
      const uId = ctx.req.accessToken.userId.toJSON();
      const st = await Student.findById(uId);
      if (st.availableUntil === "correction") {
        throw "Você está em uma correção"
      }
    } else {
      return;
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
    const LevelLog = Student.app.models.levelLog;
    const usr = await Student.findById(id);
    LevelLog.create({
      student: usr.username,
      hour: `${new Date().getHours()}:${new Date().getMinutes()}`,
      date: `${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
      level: usr.activityNumber,
      file: data.path,
    });
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

  Student.buyCPoint = async function(id) {
    const stu =  await Student.findById(id);
    const changes = {};
    if (stu.coins < 104) {
      throw "Moedas insuficientes!"
    }
    changes.correctionPoints = stu.correctionPoints + 1;
    changes.coins = stu.coins - 104;
    stu.updateAttributes(changes);
    return true
  }

    Student.remoteMethod('buyCPoint', {
    accepts: [
      {
        arg: 'id',
        type: 'string',
        required: true,
      },
    ],
    returns: {root: true},
    description: 'Buys one correction point with coins',
    http: {path: '/:id/buyCPoint', verb: 'put'},
  });

  Student.transferCoins = async function(id, data) {
    const stuFrom =  await Student.findById(id);
    const stuTo =  await Student.findOne({where: {username: data.to}});
    if (stuFrom.coins < data.value)
      throw "Moedas insuficientes!"
    else if (data.value < 1 || data.value % 1 !== 0)
      throw "Valor inválido!"
    else if (!stuTo)
      throw "Destinatário inválido!"
    stuFrom.updateAttributes({coins: stuFrom.coins - data.value});
    stuTo.updateAttributes({coins: stuTo.coins + Number(data.value)});
    return true
  }

    Student.remoteMethod('transferCoins', {
    accepts: [
      {
        arg: 'id',
        type: 'string',
        required: true,
      },
      {
        arg: 'data',
        type: 'object',
        http: {source: 'body'},
        required: true,
      },
    ],
    returns: {root: true},
    description: 'Transfers coins from one student to other',
    http: {path: '/:id/transferCoins', verb: 'put'},
  });
};
