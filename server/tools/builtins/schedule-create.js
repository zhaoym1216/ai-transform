const scheduleStore = require('../../schedule/schedule-store');
const { syncScheduleToMemory } = require('../../schedule/schedule-memory-sync');
const { logScheduleEvent } = require('../../schedule/schedule-log');

function triggerScheduleTick() {
  queueMicrotask(() => {
    try {
      require('../../schedule/runner')
        .tick()
        .catch((e) => console.error('schedule tick after create:', e));
    } catch (e) {
      console.error('schedule tick after create:', e);
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
  name: 'schedule_create',
  riskLevel: 'confirm',
  description:
    '创建定时任务：按 Cron 表达式与时区重复执行。userMessage 为到点时交给模型的任务说明。' +
    '若任务可能调用需确认或危险工具，须将工具名列入 preApprovedTools，并在对话中取得用户明确同意后再创建。',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '任务名称' },
      cronExpression: {
        type: 'string',
        description: 'Cron 表达式（5 段：分 时 日 月 星期），如 0 9 * * * 表示每天 9:00',
      },
      timezone: {
        type: 'string',
        description: 'IANA 时区，如 Asia/Shanghai',
      },
      userMessage: {
        type: 'string',
        description: '到点时作为用户消息交给助手执行的任务描述',
      },
      preApprovedTools: {
        type: 'array',
        items: { type: 'string' },
        description:
          '执行时允许跳过交互确认的工具名列表（须为已注册工具名，如 send_email）。仅绑定本任务。',
      },
      preApprovedNote: {
        type: 'string',
        description: '可选，记录用户同意预授权的简要说明',
      },
      enabled: {
        type: 'boolean',
        description: '是否启用，默认 true',
      },
    },
    required: ['cronExpression', 'userMessage'],
  },
  handler: async (args) => {
    const timezone = args.timezone || 'Asia/Shanghai';
    if (!scheduleStore.validateCron(args.cronExpression, timezone)) {
      throw new Error('Cron 表达式或时区无效，请检查格式');
    }

    const preApprovedTools = validatePreApprovedTools(args.preApprovedTools);
    const preApprovedAt =
      preApprovedTools.length > 0 ? new Date().toISOString() : null;

    const row = await scheduleStore.add({
      name: args.name,
      cronExpression: args.cronExpression,
      timezone,
      userMessage: args.userMessage,
      preApprovedTools,
      preApprovedNote: args.preApprovedNote || null,
      preApprovedAt,
      enabled: args.enabled !== false,
    });

    await syncScheduleToMemory(row);

    logScheduleEvent({
      kind: 'task_created',
      scheduleId: row.id,
      scheduleName: row.name,
      enabled: row.enabled,
      cronExpression: row.cronExpression,
      timezone: row.timezone,
      nextRunAt: row.nextRunAt,
      preApprovedTools: row.preApprovedTools || [],
      preApprovedNote: row.preApprovedNote || null,
      userMessage: (row.userMessage || '').slice(0, 2000),
    });

    if (row.enabled) {
      require('../../schedule/state').resumeRunnerAfterUserMutation();
      triggerScheduleTick();
    }

    return `定时任务已创建：id=${row.id} 名称=${row.name} 下次运行=${row.nextRunAt} 预授权=${preApprovedTools.join(',') || '无'}`;
  },
};
