const fs = require('fs/promises');
const path = require('path');

const PUBLIC_ROOT = path.join(__dirname, '..', '..', 'public');
/** 在 public 下扫描的目录名（与 MCP filesystem 根目录一致，便于托管可安全读写的技能） */
const SKILL_ROOT_NAMES = ['.skills', 'skills'];

const INJECT_MODES = new Set(['full', 'summary', 'index']);

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

function normalizeInjectMode(raw) {
  const v = (raw || 'index').toLowerCase().trim();
  return INJECT_MODES.has(v) ? v : 'index';
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

function buildSection({ inject, title, rel, desc, body }) {
  const pathLine = `（来源: public/${rel}，可用 MCP filesystem 读取全文）`;
  if (inject === 'index') {
    const head = desc ? `${desc}\n\n` : '';
    return (
      `### ${title}\n${pathLine}\n\n` +
      `${head}` +
      `（默认仅索引：正文未注入系统提示；若任务需要该技能细节，请先读取上述路径的 SKILL.md。）`
    );
  }
  if (inject === 'summary') {
    const max = Math.min(20_000, Math.max(200, parseInt(String(body.summaryMax || 800), 10) || 800));
    const b = body.text.trim();
    if (!b) {
      return `### ${title}\n${pathLine}\n\n${desc ? `${desc}\n\n` : ''}（无正文可摘要）`;
    }
    const excerpt = b.length <= max ? b : `${b.slice(0, max)}\n\n…（正文已截断，全文见 public/${rel}）`;
    return `### ${title}\n${pathLine}\n\n${desc ? `${desc}\n\n` : ''}${excerpt}`;
  }
  const b = body.text.trim();
  const head = desc ? `${desc}\n\n` : '';
  return `### ${title}\n${pathLine}\n\n${head}${b}`;
}

/**
 * 服务启动时扫描 public/.skills、public/skills 下所有 SKILL.md。
 * 默认 inject: index（仅名称、描述、路径）；inject: summary 截断正文；inject: full 注入全文。
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
      const inject = normalizeInjectMode(meta.inject);
      const rel = relPublic(filePath);
      const title = meta.name || path.basename(path.dirname(filePath));
      const desc = (meta.description || '').trim();

      if (inject === 'full' && !body.trim()) continue;

      sections.push(
        buildSection({
          inject,
          title,
          rel,
          desc,
          body: { text: body, summaryMax: meta.summary_max },
        })
      );
    }
  }

  if (sections.length === 0) {
    cachedPrompt = '';
    console.log('  Public skills: none (expected public/.skills or public/skills/SKILL.md)');
    return;
  }

  cachedPrompt =
    '【公开 Skills — 来自 public 目录】\n' +
    '下列条目由服务启动时扫描 SKILL.md 生成。默认仅注入索引（inject 未写或 index）；' +
    '需要完整流程时在 frontmatter 设 inject: full，或设 inject: summary（可选 summary_max 字数）以注入截断正文。\n\n' +
    sections.join('\n\n---\n\n');
  console.log(`  Public skills: ${sections.length} SKILL.md loaded (index/summary/full 由各自 frontmatter 决定)`);
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
