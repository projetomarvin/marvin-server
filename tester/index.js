'use strict';
const check = require('./check.js');
const pyCheck = require('./pycheck.js');

function arraysEqual(arr1, arr2) {
  return JSON.stringify(arr1) === JSON.stringify(arr2);
}

function parse(txt) {
  if (typeof txt === 'object') {
    return JSON.stringify(txt);
  } else {
    return txt;
  }
}

function parseResult(corr, res) {
  const lines = [];
  if (corr.param) {
    let paramStr = corr.param;
    if (Array.isArray(corr.param)) {
      paramStr = corr.param.join(', ');
    }
    lines.push(`Testando parâmetro **${parse(paramStr)}**`);
  }
  if (corr.result !== undefined) {
    const typeCorr = typeof corr.result;
    const typeRes = typeof res.result;
    lines.push(
      `O resultado esperado era **${parse(corr.result)}** (${typeCorr}) ` +
        `e o obtido foi **${parse(res.result)}** (${typeRes})`,
    );
  }
  if (corr.output) {
    lines.push(
      `O console.log esperado era **${parse(corr.output)}** ` +
        `e o obtido foi **${parse(res.output)}**`,
    );
  }
  return lines.join('\n');
}

const normalize = st => {
  if (typeof st !== 'string' || lvl < 3) {
    return st;
  }
  let str = st.toLowerCase();
  str = str.replace(/[àáâãäå]/, 'a');
  str = str.replace(/[éèêẽë]/, 'e');
  str = str.replace(/[íìîĩ]/, 'i');
  str = str.replace(/[óòôõ]/, 'o');
  str = str.replace(/[úùũû]/, 'u');
  str = str.replace(/[ç]/, 'c');
  return str;
};

module.exports = {
  runTest: async function(fase, id, python) {
    const lvl = Number(/fase0(\d)/g.exec(fase[0].path)[1]);
    console.log(lvl);
    const run = Promise.all(
      fase.map(async function(e, i) {
        const a = Promise.all(
          e.corrections.map(async t => {
            let isValid, test;
            if (t.result) {
              isValid = Boolean(t.result[0] === '/');
            }
            if (isValid) {
              t.result = t.result.slice(1, -1);
            }
            if (!t.output) t.output = '';
            if (python) {
              test = await pyCheck(
                e.path.substring(0, e.path.length - 2) + 'py',
                t.param,
                id,
              );
            } else {
              test = await check(e.path, t.param, id); // for JS
            }
            if (Array.isArray(test.output) && test.output.length === 1) {
              test.output = test.output.join();
            }
            console.log('RESULT', t, test);
            const answer = {
              level: i,
              test: parseResult(t, test),
            };
            console.log(answer);
            if (typeof test !== 'object') {
              answer.correct = false;
              answer.test = test;
              return answer;
            } else if (isValid) {
              let test2, test3;
              if (python) {
                test2 = await pyCheck(
                  e.path.substring(0, e.path.length - 2) + 'py',
                  t.param,
                  id,
                );
                test3 = await pyCheck(
                  e.path.substring(0, e.path.length - 2) + 'py',
                  t.param,
                  id,
                );
              } else {
                test2 = await check(e.path, t.param, id);
                test3 = await check(e.path, t.param, id);
              }
              answer.test +=
                '\nOutros resultados:\n' + test2.result + ', ' + test3.result;
              if (
                t.result &&
                test.output.toString() === t.output &&
                new RegExp(t.result, 'g').test(test.result) &&
                new RegExp(t.result, 'g').test(test2.result) &&
                new RegExp(t.result, 'g').test(test3.result)
              ) {
                answer.correct = true;
                return answer;
              } else {
                answer.correct = false;
                return answer;
              }
            } else if (
              (normalize(test.output.toString()) == normalize(t.output) &&
                normalize(test.result) === normalize(t.result)) ||
              (test.result &&
                t.result &&
                arraysEqual(test.result, t.result) &&
                arraysEqual(test.output.toString()), t.output)
            ) {
              answer.correct = true;
              return answer;
            } else {
              answer.correct = false;
              return answer;
            }
          }),
        );
        const b = await a;
        return b;
      }),
    );
    const c = await run;
    return c;
  },
};
