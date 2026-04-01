const scheduleState = require('../../schedule/state');
const scheduleStore = require('../../schedule/schedule-store');
const { syncScheduleToMemory } = require('../../schedule/schedule-memory-sync');
const { logScheduleEvent } = require('../../schedule/schedule-log');

module.exports = {
  name: 'schedule_restore_ack',
  riskLevel: 'normal',
  description:
    '服务重启后，在用户明确同意或拒绝恢复定时调度时调用。resume=true 则启动调度器；resume=false 则保持暂停（不修改磁盘上的任务启用状态）。',
  parameters: {
    type: 'object',
    properties: {
      resume: {
        type: 'boolean',
        description: 'true=恢复自动调度，false=保持暂停直至再次调用且为 true',
      },
    },
    required: ['resume'],
  },
  handler: async ({ resume }) => {
    if (!scheduleState.isPendingScheduleRestore()) {
      return '当前无需服务重启后的调度确认；若需暂停或恢复调度，请使用 schedule_update 调整任务启用状态。';
    }

    scheduleState.acknowledgeRestore(!!resume);
    const rows = scheduleStore.list({ enabledOnly: true });
    for (const r of rows) {
      await syncScheduleToMemory(r);
    }

    logScheduleEvent({
      kind: 'restore_ack',
      resume: !!resume,
      enabledTaskCount: rows.length,
      scheduleIds: rows.map((r) => r.id),
    });

    if (resume) {
      queueMicrotask(() => {
        try {
          require('../../schedule/runner')
            .tick()
            .catch((e) => console.error('schedule tick after restore:', e));
        } catch (e) {
          console.error('schedule tick after restore:', e);
        }
      });
    }

    return resume
      ? '已恢复定时任务调度。'
      : '已按用户选择保持调度暂停（任务配置未删除，可稍后再次调用本工具并 resume=true 恢复）。';
  },
};
