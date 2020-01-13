'use strict';
const moment = require('moment');
const sgMail = require('@sendgrid/mail');

const sgKey = process.env.SENDGRID_API_KEY;
sgMail.setApiKey(sgKey);

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

  Course.afterRemote('prototype.__create__students', async (ctx, data) => {
    const AccessToken = Course.app.models.AccessToken;
    const newToken = {
      ttl: 86400,
      created: new Date(),
      userId: String(data.id),
    };
    const token = await AccessToken.upsert(newToken, {upsert: false});
    const msg = {
      to: data.email,
      from: 'contato@projetomarvin.com',
      subject: 'Boas vindas ao Marvin',
      text: 'Olá, chegou a hora de começar as atividades. Como dito, fazemos tudo isso pela nossa plataforma https://app.projetomarvin.com.\n\n' +
      'O primeiro acesso será com seu e-mail, e a senha padrão é projetomarvin. Para mudar sua senha, acesse o link abaixo:\n\n' +
      `https://app.projetomarvin.com/reset-password.html?${token.id}`,
    };
    sgMail.send(msg);
  });
};
