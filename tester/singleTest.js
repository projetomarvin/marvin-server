'use strict';
const check = require('./singleTestJs.js');
const pyCheck = require('./pycheck.js');

function arraysEqual(arr1, arr2) {
  return JSON.stringify(arr1) === JSON.stringify(arr2);
}

async function run(code, name, tests, python) {
  const run = Promise.all(
    tests.map(async (t) => {
      let test;
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
      } else if (t.function) {
        if (python) {
          await pyCheck(code, t.param, name);
          await pyCheck(code, t.param, name);
        } else {
          await check(code, t.param, name);
          await check(code, t.param, name);
        }
        answer.test = 'testando na função: ' + t.function;
        if (eval(t.function)) {
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

const code = `function mostrarNome() {
  console.log("Marvin");
}`;

const corrections = [
  {
    // param: [],
    output: 'Marvin',
  },
];

// run(code, 'mostrarNome', corrections).then((r) => console.log(r));
