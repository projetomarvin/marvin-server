'use strict';
const fs = require('fs');
const {VM} = require('vm2');

module.exports = async function(level, param, id) {
  let folder;
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
      else arrayParams += p.toString() + ',';
    });
    params = arrayParams;
  }
  let file = fs.readFileSync(levelPath, 'utf-8');
  const functionFile = file.match(/(fun.*{[\s\S]*}[\s]*$)/g);
  if (!functionFile) return 'Função inválida!';
  file = functionFile[0] + '\n ' + levelName + '(' + params + ')';
  const vm = new VM({
    sandbox: {
      userScript: file,
    },
  });
  const log = vm.run(
    'let output = [], console = {log: function(msg) { output.push(msg) }}; (function() { return {output, result: eval(userScript)} })();'
  );
  console.log(log);
  return log;
};
