const scheduleStore = require('../../schedule/schedule-store');
const { syncScheduleToMemory } = require('../../schedule/schedule-memory-sync');
const { logScheduleEvent } = require('../../schedule/schedule-log');

function triggerScheduleTick() {
  queueMicrotask(() => {
    try {
      require('../../schedule/runner')
        .tick()
        .catch((e) => console.error('schedule tick after update:', e));
    } catch (e) {
      console.error('schedule tick after update:', e);
    }
  });
}

function validatePreApprovedTools(names) {
  const toolRegistry = require('../registry');
  const list = Array.isArray(names) ? names : [];
  const out = [];
  for (const n of list) {
    if (typeof n !== 'string' || !n.trim()) continue;
    const name = n.trim();
    if (!toolRegistry.hasTool(name)) {
      throw new Error(`预授权工具名无效或不存在: ${name}`);
    }
    out.push(name);
  }
  return [...new Set(out)];
}

module.exports = {
  name: 'schedule_update',
  riskLevel: 'confirm',
  description:
    '更新定时任务：可改名称、cron、时区、任务文案、启用状态、预授权工具列表等。' +
    '修改 cron 或时区后会重新计算下次运行时间。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '任务 id' },
      name: { type: 'string' },
      cronExpression: { type: 'string' },
      timezone: { type: 'string' },
      userMessage: { type: 'string' },
      enabled: { type: 'boolean' },
      preApprovedTools: {
        type: 'array',
        items: { type: 'string' },
        description: '替换整个预授权列表；不传则保持原值',
      },
      preApprovedNote: { type: 'string' },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const { id, preApprovedTools, ...rest } = args;
    const patch = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = v;
    }

    if (args.cronExpression != null || args.timezone != null) {
      const current = scheduleStore.getById(id);
      if (!current) throw new Error(`未找到任务 ${id}`);
      const cron = args.cronExpression ?? current.cronExpression;
      const tz = args.timezone ?? current.timezone;
      if (!scheduleStore.validateCron(cron, tz)) {
        throw new Error('Cron 表达式或时区无效');
      }
    }

    if (preApprovedTools !== undefined) {
      const validated = validatePreApprovedTools(preApprovedTools);
      patch.preApprovedTools = validated;
      patch.preApprovedAt =
        validated.length > 0 ? new Date().toISOString() : null;
    }

    const row = await scheduleStore.update(id, patch);
    await syncScheduleToMemory(row);

    logScheduleEvent({
      kind: 'task_updated',
      scheduleId: row.id,
      scheduleName: row.name,
      enabled: row.enabled,
      cronExpression: row.cronExpression,
      timezone: row.timezone,
      nextRunAt: row.nextRunAt,
      preApprovedTools: row.preApprovedTools || [],
      userMessage: (row.userMessage || '').slice(0, 2000),
    });

    if (row.enabled) {
      require('../../schedule/state').resumeRunnerAfterUserMutation();
      triggerScheduleTick();
    }

    return `定时任务已更新：id=${row.id} 下次运行=${row.nextRunAt} enabled=${row.enabled}`;
  },
};
