const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'public', 'schedule-logs');
const MAX_LINE_CHARS = 8000;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logFilePathForToday() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return path.join(LOG_DIR, `${y}-${m}-${day}.jsonl`);
}

function appendScheduleRunRecord(record) {
  ensureLogDir();
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
  const trimmed = line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) + '…' : line;
  fs.appendFileSync(logFilePathForToday(), `${trimmed}\n`, 'utf-8');
}

/** 统一写入 schedule 相关日志（kind: task_created | task_updated | run_start | run_end | restore_ack 等） */
function logScheduleEvent(record) {
  appendScheduleRunRecord(record);
}

function createScheduleLogger(scheduleId, scheduleName) {
  const lines = [];

  function writer(event) {
    if (!event || typeof event !== 'object') return;
    const t = event.type;
    if (t === 'delta' && event.content) {
      const last = lines[lines.length - 1];
      if (last && last.type === 'delta_tail') {
        last.text = (last.text || '') + event.content;
        if (last.text.length > 2000) last.text = last.text.slice(-2000);
      } else {
        lines.push({ type: 'delta_tail', text: String(event.content).slice(0, 2000) });
      }
      return;
    }
    if (t === 'tool_call') {
      lines.push({
        type: 'tool_call',
        name: event.name,
        args: event.arguments,
        riskLevel: event.riskLevel,
      });
      return;
    }
    if (t === 'tool_result') {
      lines.push({
        type: 'tool_result',
        name: event.name,
        isError: event.isError,
        content:
          typeof event.content === 'string'
            ? event.content.slice(0, 1500)
            : JSON.stringify(event.content).slice(0, 1500),
      });
      return;
    }
    if (t === 'error') {
      lines.push({ type: 'error', message: event.message });
    }
  }

  function flush(status, errorMessage) {
    appendScheduleRunRecord({
      kind: 'run_end',
      scheduleId,
      scheduleName,
      status,
      errorMessage: errorMessage || null,
      events: lines.slice(-80),
    });
  }

  return { writer, flush };
}

module.exports = {
  appendScheduleRunRecord,
  logScheduleEvent,
  createScheduleLogger,
  LOG_DIR,
};
