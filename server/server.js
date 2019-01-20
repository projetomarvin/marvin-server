'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');
var https = require('https');
var sslConfig = require('./ssl/ssl-config');
const fileUpload = require('express-fileupload');

const app = module.exports = loopback();
app.use(fileUpload());

var options = {
  key: sslConfig.privateKey,
  cert: sslConfig.certificate,
};

app.start = function() {
  var server = https.createServer(options, app);
  // start the web server
  return server.listen(app.get('port'), function() {
    var baseUrl = 'https://' + app.get('host') + ':' + app.get('port');
    app.emit('started', baseUrl);
    console.log('LoopBack server listening @ %s%s', baseUrl, '/');

    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
