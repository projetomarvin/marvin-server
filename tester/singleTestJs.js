'use strict';
const {VM} = require('vm2');

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

module.exports = async function(code, param, name) {
  let log;
  let params = param;
  if (typeof param === 'string') params = "'" + params + "'";
  else if (Array.isArray(param)) {
    let arrayParams = '';
    params.map(p => {
      if (typeof p === 'string') arrayParams += "'" + p + "',";
      else if (!Array.isArray(p)) arrayParams += JSON.stringify(p) + ',';
      else arrayParams += JSON.stringify(p) + ',';
    });
    params = arrayParams;
  }
  const functionFile = code.match(/(fun.*{[\s\S]*}[\s]*$)/g);
  if (!functionFile) return 'Função inválida!';
  if (usesFor(functionFile[0])) return 'Uso de laço for identificado';
  code = functionFile[0] + '\n ' + name + '(' + params + ')';
  const vm = new VM({
    sandbox: {
      userScript: code,
    },
  });
  try {
    log = vm.run(
      'let output = [], console = {log: function(msg) ' +
        '{ output.push(String(msg)) }}; (function() { return {' +
        'output, result: eval(userScript)} })();',
    );
  } catch (e) {
    return e.message;
  }
  return log;
};
