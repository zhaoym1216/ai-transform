const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memories.json');
const MAX_MEMORIES = 200;

let writeLock = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(MEMORY_FILE)) return [];
  try {
    const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function save(memories) {
  while (writeLock) {
    await new Promise((r) => setTimeout(r, 50));
  }
  writeLock = true;
  try {
    ensureDataDir();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf-8');
  } finally {
    writeLock = false;
  }
}

async function add({ content, importance, category, tags }) {
  const memories = load();
  if (memories.length >= MAX_MEMORIES) {
    throw new Error(
      `记忆条数已达上限 (${MAX_MEMORIES})，请先删除不需要的记忆再添加新记忆`,
    );
  }

  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    content,
    importance: importance || 'normal',
    category: category || 'note',
    tags: tags || [],
    createdAt: now,
    updatedAt: now,
  };
  memories.push(entry);
  await save(memories);
  return entry;
}

async function update(id, patch) {
  const memories = load();
  const idx = memories.findIndex((m) => m.id === id);
  if (idx === -1) throw new Error(`未找到 id 为 ${id} 的记忆`);

  const allowed = ['content', 'importance', 'category', 'tags'];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      memories[idx][key] = patch[key];
    }
  }
  memories[idx].updatedAt = new Date().toISOString();
  await save(memories);
  return memories[idx];
}

async function remove(id) {
  const memories = load();
  const idx = memories.findIndex((m) => m.id === id);
  if (idx === -1) throw new Error(`未找到 id 为 ${id} 的记忆`);

  const removed = memories.splice(idx, 1)[0];
  await save(memories);
  return removed;
}

function query({ importance, category, keyword, tags, limit } = {}) {
  let results = load();

  if (importance) {
    results = results.filter((m) => m.importance === importance);
  }
  if (category) {
    results = results.filter((m) => m.category === category);
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    results = results.filter(
      (m) =>
        m.content.toLowerCase().includes(kw) ||
        m.tags.some((t) => t.toLowerCase().includes(kw)),
    );
  }
  if (tags && tags.length > 0) {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    results = results.filter((m) =>
      m.tags.some((t) => tagSet.has(t.toLowerCase())),
    );
  }

  results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const cap = limit || 20;
  return results.slice(0, cap);
}

function getByImportance(level) {
  return load()
    .filter((m) => m.importance === level)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function count() {
  return load().length;
}

module.exports = { load, save, add, update, remove, query, getByImportance, count };
