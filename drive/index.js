'use strict';
const {google} = require('googleapis');

const token = require('./token.json');
const credentials = require('./credentials.json');

async function auth() {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]
  );
  oAuth2Client.setCredentials(token);

  return oAuth2Client;
}

async function listFiles(auth, url) {
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

module.exports = auth;

// checkFolder('1tW9CfsG9nhNnkOSG_W0aTNmZCBJCqbdA').then(r => console.log(r));
