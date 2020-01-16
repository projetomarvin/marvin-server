'use strict';
const axios = require('axios');
const moment = require('moment');
const sgMail = require('@sendgrid/mail');
const { google } = require('googleapis');

const dryRun = require('../../tester/singleTest.js');
const GDrive = require('../../drive/index.js');
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

  Student.checkRepository = async function(username, id) {
    const url = `https://api.github.com/users/${username}/repos?access_token=${process.env.GITHUB_TOKEN}`;
    try {
      const res = await axios(url);
      console.log(res.data);
      const repo = res.data.find(x => x.full_name === `${username}/marvin`);
      console.log(repo);
      if (!repo) {
        return 'repo not found';
      }
      return {...res.data, id};
    } catch (error) {
      console.log(error.response.data);
      if (error.response.data.message === 'Not Found') {
        return 'user not found';
      }
    }
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
    console.log(data);
    const StudentActivity = Student.app.models.StudentActivity;
    const Course = Student.app.models.Course;
    if (typeof data !== 'string') {
      console.log(data.id, data.owner.login);
      const usr = await Student.findById(data.id);
      const course = await Course.findById(usr.courseId, {
        include: 'activities',
      });
      if (usr.activityNumber > 0) {
        return;
      }
      const activities = course.toJSON().activities;
      console.log(usr, activities);
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
      return usr;
    } else {
      console.log('is string');
    }
  });

  Student.linkGithub = async function(token, id) {
    console.log(id, token);
    const student = await Student.findById(id);
    return axios
      .post('https://github.com/login/oauth/access_token', {
        client_id: '71f8116e373c16f3eb11',
        client_secret: '963642187139722787a001456c34002985a9f22c',
        code: token,
      })
      .then(r => {
        const authToken = r.data.split('=')[1].split('&')[0];
        console.log(authToken);
        if (authToken !== 'bad_verification_code') {
          student.updateAttributes({githubAccessToken: authToken});
          return authToken;
        } else {
          const err = new Error();
          err.status = 500;
          return err;
        }
      });
  };

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

  function valdiateFolder(folder){
    if (!folder.name.includes("Marvin Sheets - ")) {
      return new Error('Nome da pasta inválido');
    } else {
      return true;
    }
  };

  async function findFolder(auth, url) {
    const drive = google.drive({version: 'v3', auth});
    try {
      const result = await drive.files.get({
        fileId: url,
        fields: '*',
      });
      return (result.data);
    } catch (error) {
      return error.errors;
    }
  }

  Student.linkGDrive = async (path, id) => {
    const stu = await Student.findById(id);
    const auth = await GDrive();
    const folder = await findFolder(auth, path)
    console.log(folder);
    if (folder[0] && folder[0].reason && folder[0].reason === 'notFound') {
      throw 'Pasta não encontrada. Verifique as configurações de compartilhiamento';
    }
    const result = valdiateFolder(folder);
    if (result === true) {
      stu.updateAttributes({ GDriveURL: folder.webViewLink, activityNumber: 1 });
      return true;
    } else {
      throw result;
    }
  }

 Student.remoteMethod('linkGDrive', {
    accepts: [
      {
        arg: 'url',
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
    description: 'Validate Google Drive folder',
    http: {path: '/:id/checkDrievFolder', verb: 'post'},
  });

  Student.beforeRemote('prototype.patchAttributes', async function(ctx, data) {
    const uId = ctx.req.accessToken.userId.toJSON();
    const st = await Student.findById(uId);
    if (
      ctx.req.body.availableUntil &&
      ctx.req.body.availableUntil !== 'available'
    ) {
      if (st.availableUntil === 'correction') {
        throw 'Você está em uma correção';
      }
    } else if (ctx.req.body.panic === 'true') {
      console.log('coinnnnnnnn');
      if (st.coins < 420) {
        throw 'Você não tem moedas insuficientes';
      }
      ctx.req.body.coins = st.coins - 420;
    } else {
      return;
    }
  });

  function gitPush(usr, data, sha) {
    axios
      .put(
        `https://api.github.com/repos/${usr.username}/marvin/contents/${data.path}`,
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
      date: `${new Date().getDate()}/${new Date().getMonth() +
        1}/${new Date().getFullYear()}`,
      level: usr.activityNumber,
      file: data.path,
    });
    return axios(
      `https://api.github.com/repos/${usr.username}/marvin/contents/${data.path}`,
      {
        headers: {
          Authorization: 'token ' + usr.githubAccessToken,
        },
      }
    )
      .then(r => {
        gitPush(usr, data, r.data.sha);
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

  Student.getUsername = async function(id) {
    const stu = await Student.findById(id);
    if (stu) {
      return stu.username || stu.email;
    } else {
      const err = new Error();
      err.status = 500;
      throw err;
    }
  };

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

  Student.showPending = async function (id) {
    const sts = await Student.find({ where: {
      courseId: id,
    }, include: {
      relation: 'studentActivities',
      scope: {
        where: {finishedAt: {neq: null}},
        include: {
          relation: 'corrections',
          scope: {
            where: {marvinCorrection: undefined}
          }
        }
      }
    }});
    return sts;
  }

  Student.remoteMethod('showPending', {
    accepts: [
      {
        arg: 'id',
        type: 'string',
        required: true,
      },
    ],
    returns: {root: true},
    description: 'pendinf excel correctoins',
    http: {path: '/pending/course/:id/', verb: 'get'},
  });

  function sendMail(username, product) {
    sgMail.setApiKey(sgKey);
    const msg = {
      to: 'dnolascodante@gmail.com',
      from: 'contato@projetomarvin.com',
      subject: 'Compra na loja',
      text: `${username} comprou um ${product}`,
    };
    sgMail.send(msg);
  }

  Student.buy = async function(id, product) {
    const stu = await Student.findById(id);
    const changes = {};
    let formId = '';
    switch (product) {
      case 'CPoints':
        if (stu.coins < 104) {
          throw 'Moedas insuficientes!';
        }
        changes.correctionPoints = stu.correctionPoints + 1;
        changes.coins = stu.coins - 104;

        break;
      case 'stickerMarvin':
        if (stu.coins < 42) {
          throw 'Moedas insuficientes!';
        }
        changes.coins = stu.coins - 42;
        sendMail(stu.username, 'adesivo MARVIN');
        break;
      case 'stickerDontPanic':
        if (stu.coins < 42) {
          throw 'Moedas insuficientes!';
        }
        changes.coins = stu.coins - 42;
        sendMail(stu.username, "adesivo DON'T PANIC");
        break;
      case 'tshirt':
        if (stu.coins < 997) {
          throw 'Moedas insuficientes!';
        }
        changes.coins = stu.coins - 997;
        sendMail(stu.username, 'camisa');
        break;
      case 'dado':
        if (stu.coins < 47) {
          throw 'Moedas insuficientes!';
        }
        changes.coins = stu.coins - 47;
        changes.dice = true;
        sendMail(stu.username, 'dado');
        break;
      case 'music3':
        if (stu.coins < 42) {
          throw 'Moedas insuficientes!';
        }
        formId = '1FAIpQLSfU2b7tdoZ8ysUNXeg4Bm4PfwkpP3XAGZHaYX4DI3OI8hIiew';
        changes.coins = stu.coins - 42;
        break;
      case 'music2':
        if (stu.coins < 35) {
          throw 'Moedas insuficientes!';
        }
        formId = '1FAIpQLSdaRnwyX437d-iIF4-d4zqh6JFaCgJQboCQWyzVEDGnATSeKg';
        changes.coins = stu.coins - 35;
        break;
      case 'music1':
        if (stu.coins < 21) {
          throw 'Moedas insuficientes!';
        }
        formId = '1FAIpQLSddMF2LWD0uoCZLtkQg0v8ca4xigl7HRICac_NecgDgWI-NqA';
        changes.coins = stu.coins - 21;
        break;
    }
    stu.updateAttributes(changes);
    return formId;
  };

  Student.remoteMethod('buy', {
    accepts: [
      {
        arg: 'id',
        type: 'string',
        required: true,
      },
      {
        arg: 'product',
        type: 'string',
        required: true,
      },
    ],
    returns: {root: true},
    description: 'Buys products with coins',
    http: {path: '/:id/buy/:product', verb: 'post'},
  });

  Student.dice = async function(id, result) {
    const stu = await Student.findById(id);
    const changes = {};
    if (!stu.dice) {
      throw "Você não tem mais dados para jogar :/"
    }
    changes.dice = false;
    switch (result) {
      case 1:
        changes.correctionPoints = stu.correctionPoints + 1;
        break;

      case 2:
        changes.correctionPoints = stu.correctionPoints - 1;
        break;
        
      case 3:
        changes.coins = stu.coins + 47;
        break;

      case 4:
        changes.coins = stu.coins - 37;
        break;

      default:
        break;
    }
    const nStu = await stu.updateAttributes(changes);
    console.log(stu, nStu, changes);
    return true;
  };

  Student.remoteMethod('dice', {
    accepts: [
      {
        arg: 'id',
        type: 'string',
        required: true,
      },
      {
        arg: 'result',
        type: 'number',
        required: true,
      },
    ],
    returns: {root: true},
    description: 'Process dice result',
    http: {path: '/:id/dice/:result', verb: 'post'},
  });

  Student.transferCoins = async function(id, data) {
    const stuFrom = await Student.findById(id);
    const stuTo = await Student.findOne({where: {username: data.to}});
    if (stuFrom.coins < data.value) throw 'Moedas insuficientes!';
    else if (data.value < 1 || data.value % 1 !== 0) throw 'Valor inválido!';
    else if (!stuTo) throw 'Destinatário inválido!';
    stuFrom.updateAttributes({coins: stuFrom.coins - data.value});
    stuTo.updateAttributes({coins: stuTo.coins + Number(data.value)});
    return true;
  };

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

  Student.dryRun = async function (fk, {code, id}) {
    const stu = await Student.findById(id);
    const Exercise = Student.app.models.Exercise;
    const ex = await Exercise.findById(fk);
    const functionName = /\/([a-z1-9]+?)\./gi.exec(ex.path)[1];
    if (stu.coins < 100) {
      throw "Moedas insuficientes!"
    }
    const result = await dryRun(code, functionName, ex.corrections);
    await stu.updateAttributes({coins: stu.coins - 100});
    return result;
  }

  Student.remoteMethod('dryRun', {
    accepts: [
      { arg: 'fk', type: 'string', required: true },
      { arg: 'data', type: 'object', http: { source: 'body', },  required: true, },
    ],
    returns: { arg: 'events', root: true },
    http: { path: '/:fk/dryRun', verb: 'post' },
  });
};
