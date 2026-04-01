const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'schedule-tool-preauth.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadRaw() {
  ensureDir();
  if (!fs.existsSync(FILE)) {
    return { grantedTools: {} };
  }
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const g = j.grantedTools;
    return { grantedTools: g && typeof g === 'object' ? g : {} };
  } catch {
    return { grantedTools: {} };
  }
}

function isGranted(toolName) {
  if (typeof toolName !== 'string' || !toolName.trim()) return false;
  const { grantedTools } = loadRaw();
  return Object.prototype.hasOwnProperty.call(grantedTools, toolName.trim());
}

/** 用户在前端确认「定时任务预授权」成功后写入，之后同工具名不再弹预授权 */
function grantTools(names) {
  const data = loadRaw();
  const now = new Date().toISOString();
  for (const n of names) {
    if (typeof n !== 'string' || !n.trim()) continue;
    data.grantedTools[n.trim()] = { approvedAt: now };
  }
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { isGranted, grantTools };
