const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', '..', '..', 'public');

const ALLOWED_PROGRAMS = new Set(['npm', 'npx', 'node']);

const NPM_SUBCOMMANDS = new Set([
  'run',
  'install',
  'ci',
  'exec',
  'ls',
  'll',
  'view',
  'outdated',
  'init',
  'prefix',
  'root',
  'help',
  'config',
  'pkg',
]);

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 200_000;

const ARG_FORBIDDEN_CHARS = /[|;&$`<>\n\r\x00]/;

const BLOCKED_LINE_PATTERNS = [
  /\bsudo\b/i,
  /\brm\s+-rf?\s+\//i,
  /\/etc\/shadow/i,
  /\bcurl\b[^\n]*\|\s*sh/i,
  /\bwget\b[^\n]*\|\s*sh/i,
  /\bgit\s+push\b/i,
  /\bgit\s+commit\b/i,
  /\bgit\s+reset\s+--hard/i,
  />\s*\/etc\//i,
  /\bchmod\s+777\b/i,
];

/** 禁止通过 node 内联执行代码（仍允许 node -v / --help 等） */
const NODE_INLINE_FORBIDDEN = new Set(['-e', '--eval', '-p', '-pe', '--print']);

function getPublicRealPath() {
  try {
    return fs.realpathSync(PUBLIC_DIR);
  } catch {
    throw new Error('public 目录不存在或不可读');
  }
}

function resolveBinary(name) {
  if (!ALLOWED_PROGRAMS.has(name)) return null;
  const isWin = process.platform === 'win32';
  const binName = isWin ? `${name}.cmd` : name;
  const dirs = (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean);
  const extra = [
    '/usr/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin',
    process.execPath ? path.dirname(process.execPath) : null,
  ].filter(Boolean);
  for (const dir of [...extra, ...dirs]) {
    const full = path.join(dir, isWin ? binName : name);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      /* continue */
    }
  }
  return null;
}

function looksLikeNpmScopedOrSubpathPackage(arg) {
  if (!arg || arg.startsWith('.') || path.isAbsolute(arg)) return false;
  return /^@[^/]+\/.+/.test(arg);
}

function isPathLikeArg(arg) {
  if (!arg || arg.startsWith('-')) return false;
  if (arg === '-') return true;
  if (path.isAbsolute(arg)) return true;
  if (looksLikeNpmScopedOrSubpathPackage(arg)) return false;
  if (arg.includes('/') || arg.includes('\\')) return true;
  if (/\.(js|mjs|cjs|ts|json|tsx|jsx)$/i.test(arg)) return true;
  return false;
}

function assertUnderPublic(resolvedPath, publicReal) {
  let rp;
  try {
    rp = fs.realpathSync(resolvedPath);
  } catch {
    throw new Error(`路径不存在或不可解析: ${resolvedPath}`);
  }
  if (rp !== publicReal && !rp.startsWith(`${publicReal}${path.sep}`)) {
    throw new Error('路径必须位于 public 目录内（含解析符号链接后）');
  }
}

function validatePathLikeArg(arg, publicReal) {
  if (arg === '-') {
    throw new Error('node 不允许以 - 从 stdin 读脚本（易挂起）');
  }
  if (path.isAbsolute(arg)) {
    assertUnderPublic(arg, publicReal);
    return;
  }
  const resolved = path.resolve(publicReal, arg);
  assertUnderPublic(resolved, publicReal);
}

function validateAllPathLikeArgs(args, publicReal) {
  for (const a of args) {
    if (isPathLikeArg(a)) validatePathLikeArg(a, publicReal);
  }
}

function flagBase(token) {
  if (!token.startsWith('-')) return token;
  const eq = token.indexOf('=');
  return eq === -1 ? token : token.slice(0, eq);
}

function flagValue(token) {
  const eq = token.indexOf('=');
  return eq === -1 ? null : token.slice(eq + 1);
}

/**
 * node：禁止内联代码；允许仅选项（如 -v、--help）；若有脚本入口则须在 public 内。
 */
function validateNodeArgs(args, publicReal) {
  if (args.length === 0) {
    throw new Error('node 至少需要一个参数（裸 node 可能进入 REPL 导致挂起）');
  }

  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--') {
      i++;
      break;
    }
    if (!a.startsWith('-')) break;

    const base = flagBase(a);
    const inlineVal = flagValue(a);

    if (NODE_INLINE_FORBIDDEN.has(base)) {
      throw new Error(`node 禁止使用 ${base}（禁止内联执行代码）`);
    }

    if (base === '-r' || base === '--require' || base === '--import') {
      let val = inlineVal;
      if (val == null || val === '') {
        val = args[i + 1];
        if (!val || val.startsWith('-')) throw new Error(`${base} 需要模块或文件路径`);
        i++;
      }
      if (val) validatePathLikeArg(val, publicReal);
      i++;
      continue;
    }

    i++;
  }

  if (i >= args.length) {
    return;
  }

  const script = args[i];
  if (script.startsWith('-')) {
    throw new Error(`node 在选项之后出现意外参数: ${script}`);
  }

  validatePathLikeArg(script, publicReal);
  const scriptAbs = path.isAbsolute(script)
    ? fs.realpathSync(script)
    : fs.realpathSync(path.resolve(publicReal, script));
  const st = fs.statSync(scriptAbs);
  if (!st.isFile()) throw new Error('node 入口必须是文件');

  i++;
  while (i < args.length) {
    if (isPathLikeArg(args[i])) validatePathLikeArg(args[i], publicReal);
    i++;
  }
}

function assertDirectoryTargetUnderPublic(absTarget, publicReal) {
  const pub = fs.realpathSync(publicReal);
  let cur = path.normalize(path.resolve(absTarget));
  for (let n = 0; n < 128; n++) {
    try {
      const rp = fs.realpathSync(cur);
      if (rp === pub || rp.startsWith(`${pub}${path.sep}`)) return;
      throw new Error('npm 安装前缀必须位于 public 目录内（或为其子目录）');
    } catch (e) {
      if (e.code !== 'ENOENT') {
        if (e.message && e.message.includes('必须位于')) throw e;
        throw e;
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error('npm 安装前缀必须位于 public 目录内（或为其子目录）');
}

function applyNpmInstallOrCiPrefix(args, publicReal) {
  if (args.length === 0) return args;
  const sub = args[0];
  if (sub !== 'install' && sub !== 'ci') return args;

  for (const a of args) {
    if (a === '-g' || a === '--global') {
      throw new Error('exec_public 禁止 npm -g/--global，依赖必须安装在 public 下');
    }
  }

  let explicit = null;
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--prefix') {
      explicit = args[++i];
      if (!explicit) throw new Error('npm --prefix 缺少路径值');
      continue;
    }
    if (a.startsWith('--prefix=')) {
      explicit = a.slice('--prefix='.length);
      if (!explicit) throw new Error('npm --prefix= 缺少路径值');
      continue;
    }
    out.push(a);
  }

  const prefixDir = explicit
    ? path.isAbsolute(explicit)
      ? path.normalize(explicit)
      : path.resolve(publicReal, explicit)
    : publicReal;

  assertDirectoryTargetUnderPublic(prefixDir, publicReal);

  return [out[0], '--prefix', prefixDir, ...out.slice(1)];
}

function validateNpmArgs(args, publicReal) {
  if (args.length === 0) throw new Error('npm 缺少子命令');
  const sub = args[0];
  if (!NPM_SUBCOMMANDS.has(sub)) {
    throw new Error(`npm 不允许的子命令: ${sub}`);
  }
  if (sub === 'config') {
    const second = args[1];
    if (second !== 'get' && second !== 'list' && second !== 'ls') {
      throw new Error('npm config 仅允许 get / list / ls');
    }
  }
  validateAllPathLikeArgs(args.slice(1), publicReal);
}

function validateNpxArgs(args, publicReal) {
  validateAllPathLikeArgs(args, publicReal);
}

function assertNoBlockedLine(args) {
  const line = args.join(' ');
  for (const re of BLOCKED_LINE_PATTERNS) {
    if (re.test(line)) throw new Error(`命令未通过安全规则: 匹配 ${re}`);
  }
}

function assertArgsSanity(args) {
  for (const a of args) {
    if (typeof a !== 'string') throw new Error('参数必须为字符串');
    if (ARG_FORBIDDEN_CHARS.test(a)) throw new Error('参数含非法 shell/控制字符');
    if (a.includes('..')) throw new Error('参数不允许包含 ..');
  }
}

module.exports = {
  name: 'exec_public',
  riskLevel: 'dangerous',
  description:
    '在 public 目录下执行命令（cwd 固定为 public，无 shell）。程序仅限 npm、npx、node。' +
    'node 允许 -v、--version、--help、--check 等仅信息/检查类调用；禁止 -e/-p/--eval/--print 内联代码。' +
    '执行 public 内脚本时路径须落在 public。npm install/ci 自动加 --prefix 到 public（或子目录），禁止 -g。' +
    '@scope/pkg 不按文件路径校验。需用户确认。',
  parameters: {
    type: 'object',
    properties: {
      program: {
        type: 'string',
        enum: ['npm', 'npx', 'node'],
        description: 'npm | npx | node',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: '参数列表（不含程序名）。例: node -v → program node, args ["-v"]',
      },
      timeoutMs: {
        type: 'integer',
        description: '超时毫秒，默认 120000，最大 300000',
      },
    },
    required: ['program', 'args'],
  },
  handler: async ({ program, args, timeoutMs }) => {
    const publicReal = getPublicRealPath();
    if (!Array.isArray(args)) throw new Error('args 必须为数组');

    assertArgsSanity(args);
    assertNoBlockedLine([program, ...args]);

    const exe = resolveBinary(program);
    if (!exe) throw new Error(`未找到可执行文件: ${program}`);

    let spawnArgs = args;
    if (program === 'npm') {
      spawnArgs = applyNpmInstallOrCiPrefix(args, publicReal);
    }

    if (program === 'node') validateNodeArgs(spawnArgs, publicReal);
    else if (program === 'npm') validateNpmArgs(spawnArgs, publicReal);
    else if (program === 'npx') validateNpxArgs(spawnArgs, publicReal);

    const limit = Math.min(
      300_000,
      Math.max(5_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)
    );

    return await new Promise((resolve, reject) => {
      const child = spawn(exe, spawnArgs, {
        cwd: publicReal,
        env: { ...process.env },
        shell: false,
        windowsHide: true,
      });

      let out = '';
      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
      }, limit);

      const append = (chunk) => {
        out += chunk;
        if (out.length > MAX_OUTPUT_CHARS) {
          killed = true;
          child.kill('SIGKILL');
        }
      };

      child.stdout?.on('data', (d) => append(d.toString()));
      child.stderr?.on('data', (d) => append(d.toString()));

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        let text = out;
        if (text.length > MAX_OUTPUT_CHARS) {
          text = text.slice(0, MAX_OUTPUT_CHARS) + '\n...[输出已截断]';
        }
        const tail =
          killed && signal
            ? `\n[进程结束: signal=${signal}${code != null ? ` code=${code}` : ''}]`
            : `\n[退出码 ${code}]`;
        resolve(text + tail);
      });
    });
  },
};
