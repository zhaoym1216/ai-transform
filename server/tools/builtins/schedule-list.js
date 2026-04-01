const scheduleStore = require('../schedule-store');

module.exports = {
  name: 'schedule_list',
  riskLevel: 'normal',
  description: '列出定时任务，可按是否仅显示已启用来筛选。',
  parameters: {
    type: 'object',
    properties: {
      enabledOnly: {
        type: 'boolean',
        description: '为 true 时仅返回已启用任务',
      },
    },
    required: [],
  },
  handler: async ({ enabledOnly } = {}) => {
    const rows = scheduleStore.list({ enabledOnly: !!enabledOnly });
    if (rows.length === 0) {
      return '当前没有定时任务。';
    }
    const lines = rows.map(
      (s) =>
        `[${s.id}] ${s.name} enabled=${s.enabled} cron=${s.cronExpression} tz=${s.timezone} next=${s.nextRunAt || '—'} preApproved=${(s.preApprovedTools || []).join(',') || '无'}`,
    );
    return `共 ${rows.length} 条：\n${lines.join('\n')}`;
  },
};
