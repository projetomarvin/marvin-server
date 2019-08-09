'use strict';
const fs = require('fs');
const axios = require('axios');

function usesFor(txt) {
  let fileFor = txt.match(/[^a-zA-Z\d"'`]for[^a-zA-Z\d]/g);
  if (!fileFor) fileFor = 0;
  else fileFor = fileFor.length;
  let stringFor = txt.match(/(["'`])(?:(?=(\\?))\2.)*?\1/g);
  if (stringFor) {
    stringFor = stringFor.join(' ').match(/[^a-zA-Z\d"'`]for[^a-zA-Z\d]/g);
    if (stringFor) stringFor = stringFor.length;
    else stringFor = 0;
  } else stringFor = 0;
  return fileFor !== stringFor;
}

module.exports = async function(level, param, id) {
  let folder, log, body;
  let result = {};
  if (fs.existsSync('/home/ubuntu/activityFiles')) {
    folder = '/home/ubuntu/activityFiles/';
  } else {
    folder = '/home/dante/Documents/';
  }
  const levelPath =
    __dirname + '/../../activityFiles/' + id + folder + id + '/' + level;
  const levelName = level.split('/')[2].split('.')[0];
  let params = param;
  if (!fs.existsSync(levelPath)) return 'arquivo não existe';
  if (typeof param === 'string') params = "'" + params + "'";
  else if (Array.isArray(param)) {
    let arrayParams = '';
    params.map(p => {
      if (typeof p === 'string') arrayParams += "'" + p + "',";
      else if (!Array.isArray(p)) arrayParams += JSON.stringify(p) + ',';
      else arrayParams += JSON.stringify(p) + ',';
    });
    params = arrayParams;
  } else if (!param && param !== 0 && param !== false) {
    params = '';
  }
  const file = fs.readFileSync(levelPath, 'utf-8');
  // const functionFile = file.match(/(fun.*{[\s\S]*}[\s]*$)/g);
  // if (!functionFile) return 'Função inválida!';
  if (usesFor(file[0])) return 'Uso de laço for identificado';
  let  functionIvk = levelName + '(' + String(params) + ')';
  functionIvk = functionIvk.replace(/true/g, 'True').replace(/false/g, 'False');
  console.log(file, functionIvk);
  const res = await axios.post('https://demoapi.projetomarvin.com/api/pythonCode/evaluate', {
    code: file,
    function: functionIvk,
  });
  if (res.data.errorMessage) {
    body = 'Erro não especificado';
  } else {
    body =  JSON.parse(res.data.body);
  }
  if (body.result === null) {
    body.result = undefined;
  }
  return body;
};
