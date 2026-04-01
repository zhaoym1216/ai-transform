module.exports = {
  name: 'get_current_time',
  riskLevel: 'normal',
  description: '获取当前日期和时间',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: '时区，如 "Asia/Shanghai"、"UTC"，默认系统时区',
      },
    },
  },
  handler: async ({ timezone } = {}) => {
    const d = new Date();
    return timezone
      ? d.toLocaleString('zh-CN', { timeZone: timezone })
      : d.toLocaleString('zh-CN');
  },
};
