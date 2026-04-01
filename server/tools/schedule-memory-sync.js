const memoryStore = require('./memory-store');

function formatScheduleSummary(schedule) {
  return [
    `定时任务「${schedule.name}」`,
    `id=${schedule.id}`,
    `启用=${schedule.enabled}`,
    `cron=${schedule.cronExpression} 时区=${schedule.timezone}`,
    `下次运行=${schedule.nextRunAt || '—'}`,
    `预授权工具=${(schedule.preApprovedTools || []).join(', ') || '无'}`,
  ].join('；');
}

async function syncScheduleToMemory(schedule) {
  const content = formatScheduleSummary(schedule);
  return memoryStore.upsertScheduleSummary(schedule.id, content, 'normal');
}

module.exports = { syncScheduleToMemory, formatScheduleSummary };
