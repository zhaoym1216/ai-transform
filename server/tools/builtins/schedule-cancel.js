const scheduleStore = require('../../schedule/schedule-store');
const { syncScheduleToMemory } = require('../../schedule/schedule-memory-sync');
const { logScheduleEvent } = require('../../schedule/schedule-log');

module.exports = {
  name: 'schedule_cancel',
  riskLevel: 'confirm',
  description: '停用定时任务（不删除记录，仅 enabled=false）。若要恢复可调用 schedule_update 设置 enabled=true。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '任务 id' },
    },
    required: ['id'],
  },
  handler: async ({ id }) => {
    const row = await scheduleStore.update(id, { enabled: false });
    await syncScheduleToMemory(row);
    logScheduleEvent({
      kind: 'task_cancelled',
      scheduleId: row.id,
      scheduleName: row.name,
      note: 'enabled=false',
    });
    return `定时任务已停用：id=${row.id} ${row.name}`;
  },
};
