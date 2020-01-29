'use strict';
const check = require('./singleTestJs.js');
const pyCheck = require('./pycheck.js');

function arraysEqual(arr1, arr2) {
  return JSON.stringify(arr1) === JSON.stringify(arr2);
}

function parseResult(corr, res) {
  const lines = [];
  if (corr.param) {
    let paramStr = corr.param;
    if (Array.isArray(corr.param)) {
      paramStr = corr.param.join(', ');
    }
    lines.push(`Testando parâmetro(s) **${paramStr}**`);
  }
  if (corr.result) {
    const typeCorr = typeof corr.result;
    const typeRes = typeof res.result;
    lines.push(
      `O resultado esperado era **${corr.result}** (${typeCorr}) ` +
        `e o obtido foi **${res.result}** (${typeRes})`,
    );
  }
  if (corr.output) {
    lines.push(
      `O console.log esperado era **${corr.output}** ` +
        `e o obtido foi **${res.output}**`,
    );
  }
  return lines.join('\n');
}

async function run(code, name, tests, python) {
  const run = Promise.all(
    tests.map(async t => {
      let isValid, test;
      if (t.result) {
        isValid = Boolean(t.result[0] === '/');
      }
      if (isValid) {
        t.result = t.result.slice(1, -1);
      }
      if (!t.output) t.output = '';
      if (python) {
        test = await pyCheck(code, t.param, name);
      } else {
        test = await check(code, t.param, name);
      }
      if (Array.isArray(test.output) && test.output.length === 1) {
        test.output = test.output.join();
      }
      console.log('RESULT', t, test);
      const answer = {
        test: parseResult(t, test),
      };
      if (typeof test !== 'object') {
        answer.correct = false;
        answer.test = test;
        return answer;
      } else if (isValid) {
        let test2, test3;
        if (python) {
          test2 = await pyCheck(code, t.param, name);
          test3 = await pyCheck(code, t.param, name);
        } else {
          test2 = await check(code, t.param, name);
          test3 = await check(code, t.param, name);
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
      } else {
        if (
          (test.output.toString() == t.output && test.result === t.result) ||
          (test.result &&
            t.result &&
            arraysEqual(test.result, t.result) &&
            test.output.toString() == t.output)
        ) {
          answer.correct = true;
          return answer;
        } else if (
          t.result &&
          t.result.test &&
          test.output.toString() === t.output &&
          t.result.test(test.result)
        ) {
          answer.correct = true;
          return answer;
        } else {
          answer.correct = false;
          return answer;
        }
      }
    }),
  );
  const c = await run;
  return c;
}

module.exports = run;
