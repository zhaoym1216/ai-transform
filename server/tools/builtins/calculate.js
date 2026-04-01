const { evaluate } = require('mathjs');

module.exports = {
  name: 'calculate',
  riskLevel: 'normal',
  description: '计算数学表达式，支持加减乘除、幂运算等',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: '数学表达式，如 "2 * (3 + 4)" 或 "2^10"',
      },
    },
    required: ['expression'],
  },
  handler: async ({ expression }) => {
    const result = evaluate(expression);
    return String(result);
  },
};
