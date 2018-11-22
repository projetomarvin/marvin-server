const check = require('./check.js');

const exercicios = {
  fase01: [
    {
      file: 'fase01/ex00/mostrarNome.js',
      tests: [
        {
          output: 'Marvin',
        },
      ],
    },
    {
      file: 'fase01/ex01/nomeDeVolta.js',
      tests: [
        {
          output: 'Marvin',
          result: 'Marvin',
        },
      ],
    },
    {
      file: 'fase01/ex02/qualNome.js',
      tests: [
        {
          param: 'Zaphod',
          result: 'Meu nome é Zaphod',
        },
        {
          param: 'Marvin',
          result: 'Meu nome é Marvin',
        },
      ],
    },
    {
      file: 'fase01/ex03/nomes.js',
      tests: [
        {
          param: ['Alpha', 1233],
          result: 'Alpha e 1233',
        },
      ],
    },
  ],
  fase02: [
    {
      file: 'fase02/ex00.js',
      tests: [
        {
          param: 'abcdefg',
          result: 'abc',
        },
        {
          param: '120',
          result: '120',
        },
        {
          param: '   dfsfsdsdf',
          result: '   ',
        },
      ],
    },
    {
      file: 'fase02/ex01.js',
      tests: [
        {
          param: 'abcdefg',
          result: 'efg',
        },
        {
          param: '132',
          result: '132',
        },
        {
          param: 'dfsfsdsdf   ',
          result: '   ',
        },
      ],
    },
    {
      file: 'fase02/ex02.js',
      tests: [
        {
          param: 'abcdefg',
          result: 'f',
        },
        {
          param: '12',
          result: '1',
        },
        {
          param: '  ',
          result: ' ',
        },
      ],
    },
    {
      file: 'fase02/ex03.js',
      tests: [
        {
          param: 'abcdefg',
          result: 'ABCDEFG',
        },
        {
          param: '12',
          result: '12',
        },
        {
          param: '   dfsfsdsdf',
          result: '   DFSFSDSDF',
        },
      ],
    },
    {
      file: 'fase02/ex04.js',
      tests: [
        {
          param: 'abcdefg',
          result: 'ABCdefg',
        },
        {
          param: '120',
          result: '120',
        },
        {
          param: '  adfsfsdsdf',
          result: '  Adfsfsdsdf',
        },
      ],
    },
    {
      file: 'fase02/ex05.js',
      tests: [
        {
          param: 'ABCD',
          output: 'a',
        },
        {
          param: '12',
          output: '1',
        },
        {
          param: 'Dfsfsdsdf',
          output: 'd',
        },
      ],
    },
  ],
};
// {
//   fase03: [
//     {
//       file: "fase03/ex00.js",
//       tests: [
//         {
//           result: /^0\.[0-9]{12,20}\w$/i
//         }
//       ]
//     },
//     {
//       file: "fase03/ex01.js",
//       tests: [
//         {
//           result: /^1[0-9]|20$/i
//         }
//       ]
//     },
//     {
//       file: "fase03/ex02.js",
//       tests: [
//         {
//           param: 12,
//           result: true
//         },
//         {
//           param: null,
//           result: false
//         },
//         {
//           param: "12.32.32",
//           result: false
//         },
//         {
//           param: Math.random(),
//           result: false
//         }
//       ]
//     },
//     {
//       file: "fase03/ex03.js",
//       tests: [
//         {
//           param: [1, 4, 9],
//           result: 14
//         },
//         {
//           param: [0, 0, 0],
//           result: 0
//         },
//         {
//           param: [-1024, 0, 2048],
//           result: 1024
//         }
//       ]
//     },
//     {
//       file: "fase03/ex04.js",
//       tests: [
//         {
//           param: [4, 1],
//           result: 3
//         },
//         {
//           param: [0, 0],
//           result: 0
//         },
//         {
//           param: [0, 1024],
//           result: -1024
//         }
//       ]
//     },
//     {
//       file: "fase03/ex05.js",
//       tests: [
//         {
//           param: [4, 244],
//           result: 4 / 244
//         },
//         {
//           param: [0, 7],
//           result: 0
//         },
//         {
//           param: [-2048, 1024],
//           result: -2
//         }
//       ]
//     },
//     {
//       file: "fase03/ex06.js",
//       tests: [
//         {
//           param: [4, 4, 4, 4],
//           result: 256
//         },
//         {
//           param: [0, 0, 0, 0],
//           result: 0
//         }
//       ]
//     },
//     {
//       file: "fase03/ex07.js",
//       tests: [
//         {
//           param: [44, 4],
//           result: "444"
//         },
//         {
//           param: [0, 0],
//           result: "00"
//         }
//       ]
//     },
//     {
//       file: "fase03/ex08.js",
//       tests: [
//         {
//           param: 4,
//           result: 2
//         },
//         {
//           param: 81,
//           result: 9
//         }
//       ]
//     }
//   ]
// },
// {
//   fase04: [
//     {
//       file: "fase04/ex00.js",
//       tests: [
//         {
//           param: "A",
//           result: "vogal"
//         },
//         {
//           param: "a",
//           result: "vogal"
//         },
//         {
//           param: "C",
//           result: "consoante"
//         },
//         {
//           param: "java",
//           result: "inválido"
//         }
//       ]
//     },
//     {
//       file: "fase04/ex01.js",
//       tests: [
//         {
//           param: "A",
//           result: undefined
//         },
//         {
//           param: "a",
//           result: undefined
//         },
//         {
//           param: "C",
//           result: true
//         },
//         {
//           param: "j",
//           result: true
//         }
//       ]
//     },
//     {
//       file: "fase04/ex02.js",
//       tests: [
//         {
//           param: 0,
//           result: "par"
//         },
//         {
//           param: 1,
//           result: "ímpar"
//         },
//         {
//           param: -42,
//           result: "par"
//         },
//         {
//           param: 54456.56,
//           result: "ímpar"
//         }
//       ]
//     },
//     {
//       file: "fase04/ex03.js",
//       tests: [
//         {
//           param: 0,
//           result: "par"
//         },
//         {
//           param: 1,
//           result: "ímpar"
//         },
//         {
//           param: -42,
//           result: "par"
//         },
//         {
//           param: 54456.56,
//           result: "ímpar"
//         }
//       ]
//     },
//     {
//       file: "fase04/ex04.js",
//       tests: [
//         {
//           param: 0,
//           result: true
//         },
//         {
//           param: 1,
//           result: false
//         },
//         {
//           param: -42,
//           result: true
//         },
//         {
//           param: 544565,
//           result: false
//         }
//       ]
//     },
//     {
//       file: "fase04/ex05.js",
//       tests: [
//         {
//           param: "dsa",
//           result: "não"
//         },
//         {
//           param: "aaa",
//           result: "sim"
//         },
//         {
//           param: "-42",
//           result: "não"
//         },
//         {
//           param: "Olho",
//           result: "sim"
//         }
//       ]
//     },
//     {
//       file: "fase04/ex06.js",
//       tests: [
//         {
//           param: 0,
//           result: true
//         },
//         {
//           param: "aaa",
//           result: false
//         },
//         {
//           param: -42,
//           result: false
//         },
//         {
//           param: 2156,
//           result: true
//         }
//       ]
//     },
//     {
//       file: "fase04/ex07.js",
//       tests: [
//         {
//           param: new Date(2013, 2, 1, 1, 10),
//           result: "ficou no passado"
//         },
//         {
//           param: new Date(2033, 2, 1, 1, 10),
//           result: "estamos no futuro"
//         }
//       ]
//     },
//     {
//       file: "fase04/ex08.js",
//       tests: [
//         {
//           param: 0,
//           result: "intervalo 1"
//         },
//         {
//           param: 5,
//           result: "intervalo 2"
//         },
//         {
//           param: 10,
//           result: "intervalo 2"
//         },
//         {
//           param: 11,
//           result: "intervalo 3"
//         },
//         {
//           param: 100.000000000001,
//           result: "intervalo 4"
//         }
//       ]
//     },
//     {
//       file: "fase04/ex09.js",
//       tests: [
//         {
//           param: "a",
//           result: "alfa"
//         },
//         {
//           param: "e",
//           result: "echo"
//         },
//         {
//           param: "i",
//           result: "india"
//         },
//         {
//           param: "o",
//           result: "oscar"
//         },
//         {
//           param: "u",
//           result: "uniform"
//         },
//         {
//           param: "carri",
//           result: "Argumento inválido"
//         }
//       ]
//     }
//   ]
// },
// {
//   fase05: [
//     {
//       file: "fase05/ex00.js",
//       tests: [
//         {
//           result: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
//         }
//       ]
//     },
//     {
//       file: "fase05/ex01.js",
//       tests: [
//         {
//           param: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
//           result: 10
//         },
//         {
//           param: [[1]],
//           result: 1
//         },
//         {
//           param: "carro",
//           result: null,
//           output: "isso não é uma array"
//         }
//       ]
//     },
//     {
//       file: "fase05/ex02.js",
//       tests: [
//         {
//           param: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
//           result: 1
//         }
//       ]
//     },
//     {
//       file: "fase05/ex03.js",
//       tests: [
//         {
//           param: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
//           result: 9
//         },
//         {
//           param: [[1, 2]],
//           result: 1
//         }
//       ]
//     },
//     {
//       file: "fase05/ex04.js",
//       tests: [
//         {
//           param: [[1, 2]],
//           result: [1, 2, "último"]
//         },
//         {
//           param: [[]],
//           result: ["último"]
//         }
//       ]
//     },
//     {
//       file: "fase05/ex05.js",
//       tests: [
//         {
//           param: [[1, 2, 430], 2],
//           result: [1, 2]
//         },
//         {
//           param: [["aaa", 1, 23, 889], 0],
//           result: [1, 23, 889]
//         }
//       ]
//     },
//     {
//       file: "fase05/ex06.js",
//       tests: [
//         {
//           param: [[1, 2, 430], [2]],
//           result: [1, 2, 430, 2]
//         },
//         {
//           param: [[], [0]],
//           result: [0]
//         }
//       ]
//     },
//     {
//       file: "fase05/ex07.js",
//       tests: [
//         {
//           param: [["a", "b", "c"]],
//           output: "a\nb\nc"
//         },
//         {
//           param: [["Marvin", "Zaphod", "42"]],
//           output: "Marvin\nZaphod\n42"
//         }
//       ]
//     },
//     {
//       file: "fase05/ex08.js",
//       tests: [
//         {
//           param: [["a", "b", "c"]],
//           result: ["a", "b"]
//         },
//         {
//           param: [["Marvin", 42, 999, "Zaphod", "42", 8]],
//           result: ["Marvin", 42, 999]
//         }
//       ]
//     }
//   ]
// },
// {
//   fase06: [
//     {
//       file: "fase06/ex00.js",
//       tests: [
//         {
//           param: [1, 5],
//           result: [1, 2, 3, 4, 5]
//         },
//         {
//           param: [-10, 2],
//           result: [-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2]
//         }
//       ]
//     },
//     {
//       file: "fase06/ex01.js",
//       tests: [
//         {
//           param: [1, 5],
//           output: "2\n4",
//           result: true
//         },
//         {
//           param: [-10, 2],
//           output: "-10\n-8\n-6\n-4\n-2\n0\n2",
//           result: true
//         }
//       ]
//     },
//     {
//       file: "fase06/ex02.js",
//       tests: [
//         {
//           param: [[5, 1, 0, 0, 0]],
//           result: 5
//         },
//         {
//           param: [[-10, 2]],
//           result: 2
//         },
//         {
//           param: [[2, 2]],
//           result: 2
//         }
//       ]
//     },
//     {
//       file: "fase06/ex03.js",
//       tests: [
//         {
//           param: "Cavalo",
//           output:
//             "é um C\nnão é um C\nnão é um C\nnão é um C\nnão é um C\nnão é um C"
//         },
//         {
//           param: "lorem ",
//           output:
//             "não é um C\nnão é um C\nnão é um C\nnão é um C\nnão é um C\nnão é um C"
//         },
//         {
//           param: "colchão",
//           output:
//             "é um C\nnão é um C\nnão é um C\né um C\nnão é um C\nnão é um C\nnão é um C"
//         }
//       ]
//     },
//     {
//       file: "fase06/ex04.js",
//       tests: [
//         {
//           param: [["arca", 1, "marvin", ["s"], ""]],
//           result: 3
//         },
//         {
//           param: [[]],
//           result: 0
//         }
//       ]
//     }
//   ]
// }
// ];

function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  for (var i = arr1.length; i--;) {
    if (arr1[i] !== arr2[i]) return false;
  }

  return true;
}

async function runTest(ex) {
  const r = new Date().getTime();
  const fase = exercicios[ex];
  let certos = 0;
  let errou = false;
  const run = Promise.all(
    fase.map(async function(e, i) {
      const a = Promise.all(
        e.tests.map(async t => {
          if (!t.output) t.output = '';
          if (!t.result) t.result = null;
          let test = await check(e.file, t.param);
          if (Array.isArray(test.output) && test.output.length === 1) {
            test.output = test.output.join();
          }
          test.result = eval(test.result);
          // console.log(t, test);
          if (typeof test !== 'object') {
            errou = true;
            return test;
          } else {
            if (
              (test.output.toString() == t.output &&
                test.result === t.result) ||
              (test.result &&
                t.result &&
                arraysEqual(test.result, t.result) &&
                test.output.toString() == t.output)
            ) {
              if (!errou) {
                certos = 1;
              }
              console.log(certos);
              return 'certo ex: ' + i;
            } else if (
              t.result &&
              t.result.test &&
              test.output.toString() === t.output &&
              t.result.test(test.result)
            ) {
              if (!errou) {
                certos = 1;
              }
              console.log(certos);
              return 'certo ex: ' + i;
            } else {
              // console.log(Array.isArray(t.result), Array.isArray(test.result));
              errou = true;
              console.log('errou ex: ' + i);
              return (
                'testando parametro(s) ' +
                t.param +
                '\nO resultado esperado era ' +
                t.result +
                ' e o obtido foi ' +
                test.result +
                '\nO console.log esperado era ' +
                t.output +
                ' e o obtido foi ' +
                test.output
              );
            }
          }
        })
      );
      const b = await a;
      console.log('done', i, b);
      return b;
    })
  );
  const t = new Date().getTime();
  console.log('fdfdsfsd', certos, t - r);
  const c = await run;
  console.log('sdasdasad', certos, new Date().getTime() - t);
}

runTest(process.argv[2]);
