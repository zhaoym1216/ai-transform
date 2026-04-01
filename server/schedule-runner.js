const ReactAgent = require('./react-agent');
const scheduleStore = require('./tools/schedule-store');
const scheduleState = require('./schedule-state');
const { createScheduleLogger, logScheduleEvent } = require('./tools/schedule-log');

let intervalId = null;
let currentAbort = null;

async function runScheduleJob(schedule) {
  logScheduleEvent({
    kind: 'run_start',
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    cronExpression: schedule.cronExpression,
    timezone: schedule.timezone,
    nextRunAt: schedule.nextRunAt,
    userMessage: (schedule.userMessage || '').slice(0, 2000),
    preApprovedTools: schedule.preApprovedTools || [],
  });

  const { writer, flush } = createScheduleLogger(schedule.id, schedule.name);
  const ac = new AbortController();
  currentAbort = ac;

  const agent = new ReactAgent({
    writer: (event) => {
      writer(event);
    },
    signal: ac.signal,
  });

  const extraSystemMessages = [
    {
      role: 'system',
      content: [
        '【定时任务 — 到点执行】',
        '当前是已排程任务的自动运行，不是让用户新建定时任务。',
        '请直接按下面的「任务说明」完成动作：例如要发邮件就调用 send_email（若已预授权则无需再问用户），要查信息就用对应工具。',
        '禁止调用任何 schedule_create、schedule_list、schedule_update、schedule_cancel、schedule_restore_ack；也不要建议用户再建一个定时任务。',
        '回答简洁，勿编造未授权操作。',
      ].join('\n'),
    },
  ];

  const userMessages = [{ role: 'user', content: schedule.userMessage }];

  try {
    await agent.run(userMessages, {
      executionContext: 'scheduled',
      preApprovedTools: schedule.preApprovedTools || [],
      extraSystemMessages,
    });
    flush('ok');
  } catch (err) {
    flush('error', err.message || String(err));
    console.error(`Scheduled job ${schedule.id} error:`, err);
  } finally {
    currentAbort = null;
  }

  const nextRunAt = scheduleStore.computeNextRunAt(
    schedule.cronExpression,
    schedule.timezone,
  );
  await scheduleStore.update(schedule.id, {
    lastRunAt: new Date().toISOString(),
    nextRunAt,
  });
}

async function tick() {
  if (scheduleState.isRunnerPaused()) return;

  const due = scheduleStore
    .list({ enabledOnly: true })
    .filter((s) => s.nextRunAt && new Date(s.nextRunAt) <= new Date());

  for (const s of due) {
    try {
      await runScheduleJob(s);
    } catch (err) {
      console.error('schedule runScheduleJob', s.id, err);
    }
  }
}

function start() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    tick().catch((e) => console.error('schedule tick', e));
  }, 30000);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
}

module.exports = { start, stop, tick };
