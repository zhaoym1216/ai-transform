const { URL } = require('url');
const dns = require('dns');
const { promisify } = require('util');

const dnsResolve = promisify(dns.resolve4);

const BLOCKED_IP_RANGES = [
  /^127\./,                      // loopback
  /^10\./,                       // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
  /^192\.168\./,                 // 192.168.0.0/16
  /^169\.254\./,                 // link-local / cloud metadata
  /^0\./,                        // 0.0.0.0/8
  /^::1$/,                       // IPv6 loopback
  /^fc00:/i,                     // IPv6 ULA
  /^fe80:/i,                     // IPv6 link-local
];

async function assertSafeUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('无效的 URL 格式');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`不允许的协议: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;

  if (BLOCKED_IP_RANGES.some((re) => re.test(hostname))) {
    throw new Error('禁止访问内网/本地地址');
  }

  try {
    const addresses = await dnsResolve(hostname);
    for (const addr of addresses) {
      if (BLOCKED_IP_RANGES.some((re) => re.test(addr))) {
        throw new Error(`域名 ${hostname} 解析到内网地址 ${addr}，已拦截`);
      }
    }
  } catch (err) {
    if (err.code === 'ENOTFOUND') {
      throw new Error(`域名无法解析: ${hostname}`);
    }
    if (err.message.includes('已拦截') || err.message.includes('禁止')) {
      throw err;
    }
  }

  return parsed;
}

module.exports = { assertSafeUrl };
