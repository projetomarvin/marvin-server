'use strict';
const check = require('./check.js');
const pyCheck = require('./pycheck.js');

function arraysEqual(arr1, arr2) {
  return JSON.stringify(arr1) === JSON.stringify(arr2);
}

module.exports = {
  runTest: async function(fase, id, python) {
    console.log(fase);
    const run = Promise.all(
      fase.map(async function(e, i) {
        const a = Promise.all(
          e.corrections.map(async t => {
            let isValid = Boolean(t.result[0] === '/');
            if (isValid) {
              t.result = t.result.slice(1, -1);
            }
            let test;
            if (!t.output) t.output = '';
            if (python) {
              test = await pyCheck(e.path.substring(0, e.path.length - 2) + 'py', t.param, id);
            } else {
              test = await check(e.path, t.param, id); // for JS
            }
            if (Array.isArray(test.output) && test.output.length === 1) {
              test.output = test.output.join();
            }
	          console.log('RESULT', t, test);
            // test.result = eval(test.result);
            const answer = {
              level: i,
              test:
                'testando parametro(s) ' +
                JSON.stringify(t.param) +
                '\nO resultado esperado era ' +
                JSON.stringify(t.result) +
                ' e o obtido foi ' +
                JSON.stringify(test.result) +
                '\nO console.log esperado era ' +
                JSON.stringify(t.output) +
                ' e o obtido foi ' +
                JSON.stringify(test.output),
            };
            if (typeof test !== 'object') {
              answer.correct = false;
              answer.test = test;
              return answer;
            } else if (isValid) {
              let test2, test3;
              if (python) {
                test2 = await pyCheck(e.path.substring(0, e.path.length - 2) + 'py', t.param, id);
                test3 = await pyCheck(e.path.substring(0, e.path.length - 2) + 'py', t.param, id);
              } else {
                test2 = await check(e.path, t.param, id);
                test3 = await check(e.path, t.param, id);
              }
              answer.test += '\nOutros resultados:\n' +
              test2.result +
              ', ' +
              test3.result;
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
                (test.output.toString() == t.output &&
                  test.result === t.result) ||
                (test.result &&
                  t.result &&
                  arraysEqual(test.result, t.result) &&
                  test.output.toString() == t.output)
              ) {
                answer.correct = true;
                return answer;
              } else {
                // console.log(Array.isArray(t.result), Array.isArray(test.result));
                answer.correct = false;
                return answer;
              }
            }
          })
        );
        const b = await a;
        return b;
      })
    );
    const c = await run;
    return c;
  },
};
