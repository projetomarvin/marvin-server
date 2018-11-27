'use strict';
const check = require('./check.js');

function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  for (var i = arr1.length; i--;) {
    if (arr1[i] !== arr2[i]) return false;
  }

  return true;
}

module.exports = {
  runTest: async function(fase, id) {
    const run = Promise.all(
      fase.map(async function(e, i) {
        const a = Promise.all(
          e.tests.map(async t => {
            if (!t.output) t.output = '';
            if (!t.result) t.result = undefined;
            let test = await check(e.file, t.param, id);
            if (Array.isArray(test.output) && test.output.length === 1) {
              test.output = test.output.join();
            }
	    console.log(t);
            // test.result = eval(test.result);
            const answer = {
              level: i,
              test:
                'testando parametro(s) ' +
                t.param +
                '\nO resultado esperado era \"' +
                t.result +
                '\" e o obtido foi \"' +
                test.result +
                '\"\nO console.log esperado era \"' +
                t.output +
                '\" e o obtido foi \"' +
                test.output + '\"',
            };
            if (typeof test !== 'object') {
              answer.correct = false;
              answer.test = test;
              return answer;
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
              } else if (
                t.result &&
                t.result.test &&
                test.output.toString() === t.output &&
                t.result.test(test.result)
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
    const t = new Date().getTime();
    const c = await run;
    return c;
  },
};
