const fs = require('fs/promises');
const path = require('path');

const PUBLIC_ROOT = path.join(__dirname, '..', '..', 'public');
/** 在 public 下扫描的目录名（与 MCP filesystem 根目录一致，便于托管可安全读写的技能） */
const SKILL_ROOT_NAMES = ['.skills', 'skills'];

let cachedPrompt = '';

function parseFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, '');
  if (!text.startsWith('---')) {
    return { meta: {}, body: text.trim() };
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    return { meta: {}, body: text.trim() };
  }
  const block = text.slice(3, end).trim();
  const body = text.slice(end + 4).trim();
  const meta = {};
  for (const line of block.split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (key && val) meta[key] = val;
  }
  return { meta, body };
}

async function walkSkillFiles(rootDir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(rootDir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkSkillFiles(full)));
    } else if (e.name === 'SKILL.md' || e.name === 'skill.md') {
      out.push(full);
    }
  }
  return out;
}

function relPublic(absPath) {
  return path.relative(PUBLIC_ROOT, absPath).split(path.sep).join('/');
}

/**
 * 服务启动时扫描 public/.skills、public/skills 下所有 SKILL.md，拼成一段系统提示补充。
 */
async function loadPublicSkillsAtStartup() {
  const sections = [];

  for (const dirName of SKILL_ROOT_NAMES) {
    const root = path.join(PUBLIC_ROOT, dirName);
    const files = await walkSkillFiles(root);
    for (const filePath of files) {
      let raw;
      try {
        raw = await fs.readFile(filePath, 'utf8');
      } catch {
        continue;
      }
      const { meta, body } = parseFrontmatter(raw);
      if (!body) continue;
      const rel = relPublic(filePath);
      const title = meta.name || path.basename(path.dirname(filePath));
      const desc = meta.description ? `${meta.description}\n\n` : '';
      sections.push(
        `### ${title}\n` +
          `（来源: public/${rel}）\n\n` +
          desc +
          body.trim()
      );
    }
  }

  if (sections.length === 0) {
    cachedPrompt = '';
    console.log('  Public skills: none (expected public/.skills or public/skills/SKILL.md)');
    return;
  }

  cachedPrompt =
    '【公开 Skills — 来自 public 目录，请在相关任务时遵循】\n' +
    '下列内容由服务启动时从 public/.skills 与 public/skills 中的 SKILL.md 自动加载。\n\n' +
    sections.join('\n\n---\n\n');
  console.log(`  Public skills: ${sections.length} SKILL.md loaded into system prompt`);
}

function getInjectedPrompt() {
  return cachedPrompt;
}

module.exports = {
  loadPublicSkillsAtStartup,
  getInjectedPrompt,
  PUBLIC_ROOT,
  SKILL_ROOT_NAMES,
};
