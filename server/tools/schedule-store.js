const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CronExpressionParser } = require('cron-parser');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedules.json');
const MAX_SCHEDULES = 100;

let writeLock = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(SCHEDULE_FILE)) return [];
  try {
    const raw = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function save(schedules) {
  while (writeLock) {
    await new Promise((r) => setTimeout(r, 50));
  }
  writeLock = true;
  try {
    ensureDataDir();
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedules, null, 2), 'utf-8');
  } finally {
    writeLock = false;
  }
}

function computeNextRunAt(cronExpression, timezone) {
  const tz = timezone || 'UTC';
  const expr = CronExpressionParser.parse(cronExpression, {
    tz,
    currentDate: new Date(),
  });
  const next = expr.next();
  return next.toISOString();
}

function validateCron(cronExpression, timezone) {
  try {
    CronExpressionParser.parse(cronExpression, { tz: timezone || 'UTC' });
    return true;
  } catch {
    return false;
  }
}

async function add(entry) {
  const schedules = load();
  if (schedules.length >= MAX_SCHEDULES) {
    throw new Error(`定时任务数量已达上限 (${MAX_SCHEDULES})`);
  }

  const now = new Date().toISOString();
  const nextRunAt = computeNextRunAt(entry.cronExpression, entry.timezone);

  const row = {
    id: crypto.randomUUID(),
    name: entry.name || '未命名任务',
    enabled: entry.enabled !== false,
    timezone: entry.timezone || 'Asia/Shanghai',
    cronExpression: entry.cronExpression,
    userMessage: entry.userMessage,
    preApprovedTools: Array.isArray(entry.preApprovedTools) ? entry.preApprovedTools : [],
    preApprovedAt: entry.preApprovedAt || null,
    preApprovedNote: entry.preApprovedNote || null,
    nextRunAt,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
  };

  schedules.push(row);
  await save(schedules);
  return row;
}

async function update(id, patch) {
  const schedules = load();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`未找到 id 为 ${id} 的定时任务`);

  const allowed = [
    'name',
    'enabled',
    'timezone',
    'cronExpression',
    'userMessage',
    'preApprovedTools',
    'preApprovedAt',
    'preApprovedNote',
    'nextRunAt',
    'lastRunAt',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      schedules[idx][key] = patch[key];
    }
  }

  if (patch.cronExpression !== undefined || patch.timezone !== undefined) {
    schedules[idx].nextRunAt = computeNextRunAt(
      schedules[idx].cronExpression,
      schedules[idx].timezone,
    );
  }

  schedules[idx].updatedAt = new Date().toISOString();
  await save(schedules);
  return schedules[idx];
}

async function remove(id) {
  const schedules = load();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`未找到 id 为 ${id} 的定时任务`);

  const removed = schedules.splice(idx, 1)[0];
  await save(schedules);
  return removed;
}

function getById(id) {
  return load().find((s) => s.id === id) || null;
}

function list({ enabledOnly } = {}) {
  let rows = load();
  if (enabledOnly) rows = rows.filter((s) => s.enabled);
  return rows.sort((a, b) => new Date(a.nextRunAt || 0) - new Date(b.nextRunAt || 0));
}

function hasEnabled() {
  return load().some((s) => s.enabled);
}

module.exports = {
  load,
  save,
  add,
  update,
  remove,
  getById,
  list,
  hasEnabled,
  computeNextRunAt,
  validateCron,
};
