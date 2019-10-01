'use strict';
const moment = require('moment');

module.exports = function(Pdf) {
  Pdf.disableRemoteMethodByName('prototype.__delete__exercises');
  Pdf.disableRemoteMethodByName('prototype.__findById__exercises');
  Pdf.disableRemoteMethodByName('prototype.__get__exercises');
  Pdf.disableRemoteMethodByName('prototype.__updateById__exercises');
  Pdf.disableRemoteMethodByName('prototype.__destroyById__exercises');
  Pdf.disableRemoteMethodByName('prototype.__count__exercises');

  Pdf.beforeRemote('create', async (ctx) => {
    console.log(ctx.req);
    const body = ctx.req.body;
    body.modifiedAt = moment();
    body.modifiedBy = ctx.req.accessToken.userId;
    return;
  });

  Pdf.beforeRemote('prototype.__create__exercises', async (ctx) => {
    console.log(ctx.req);
    const body = ctx.req.body;
    body.modifiedAt = moment();
    body.modifiedBy = ctx.req.accessToken.userId;
    return;
  });
};
