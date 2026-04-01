const scheduleStore = require('./schedule-store');

let pendingScheduleRestore = false;
let runnerPaused = false;
let restorePromptInjectedThisSession = false;

function initFromDisk() {
  restorePromptInjectedThisSession = false;
  if (scheduleStore.hasEnabled()) {
    pendingScheduleRestore = true;
    runnerPaused = true;
  } else {
    pendingScheduleRestore = false;
    runnerPaused = false;
  }
}

function isRunnerPaused() {
  return runnerPaused;
}

function isPendingScheduleRestore() {
  return pendingScheduleRestore;
}

function getRestorePromptContent() {
  const rows = scheduleStore.list({ enabledOnly: true });
  const lines = rows.map(
    (s) =>
      `- id=${s.id} 名称=${s.name} cron=${s.cronExpression} 时区=${s.timezone} 下次=${s.nextRunAt || '—'} 预授权工具=${(s.preApprovedTools || []).join(',') || '无'}`,
  );
  return [
    '【定时任务 — 服务重启后须用户确认】',
    '当前存在已启用的定时任务，调度器已暂停，尚未恢复自动执行。',
    '请向用户列出下列任务，说明重启后需其确认是否恢复自动调度；用户明确同意后请调用 schedule_restore_ack 且 resume=true，拒绝则 resume=false。',
    '不得在未调用 schedule_restore_ack 的情况下假定用户已同意。',
    '已启用任务：',
    lines.length ? lines.join('\n') : '（无 — 若列表为空可提示用户检查 schedules 数据）',
  ].join('\n');
}

function shouldInjectRestorePrompt() {
  return pendingScheduleRestore && !restorePromptInjectedThisSession;
}

function markRestorePromptInjected() {
  restorePromptInjectedThisSession = true;
}

function acknowledgeRestore(resume) {
  pendingScheduleRestore = false;
  if (resume) {
    runnerPaused = false;
  } else {
    runnerPaused = true;
  }
}

/**
 * 用户通过工具创建/启用定时任务时调用：视为已主动管理调度，解除重启门闸暂停，否则任务永不到点执行。
 */
function resumeRunnerAfterUserMutation() {
  pendingScheduleRestore = false;
  runnerPaused = false;
}

module.exports = {
  initFromDisk,
  isRunnerPaused,
  isPendingScheduleRestore,
  getRestorePromptContent,
  shouldInjectRestorePrompt,
  markRestorePromptInjected,
  acknowledgeRestore,
  resumeRunnerAfterUserMutation,
};
