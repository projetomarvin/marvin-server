const fs = require('fs');
const Sandbox = require('sandbox');
const s = new Sandbox();

module.exports = async function(level, param) {
  let params = param;
  if (typeof param === 'string') params = "'" + params + "'";
  else if (Array.isArray(param)) {
    let arrayParams = '';
    params.map(p => {
      if (typeof p === 'string') arrayParams += "'" + p + "',";
      else arrayParams += p.toString() + ',';
    });
    params = arrayParams;
  }
  const functionName = level.split('/')[2].split('.')[0];
  let result;
  let file = fs.readFileSync(level, 'utf-8');
  const functionFile = file.match(/(fun.*{[\s\S]*}[\s]*$)/g);
  if (!functionFile) return "Função inválida!";
  file = functionFile[0] + '\n ' + functionName + '(' + params + ')';
  // console.log(file);

  const func = new Promise(resolve => {
    s.run(file, o => resolve(o));
  });

  result = await func;
  result.output = result.console;
  delete result.console;

  return result;
};
