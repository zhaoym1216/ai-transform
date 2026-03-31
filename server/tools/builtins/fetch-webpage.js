const { assertSafeUrl } = require('../safe-url');

module.exports = {
  name: 'fetch_webpage',
  description: '抓取指定 URL 的网页内容并返回文本（最多 5000 字符）',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要抓取的 URL 地址',
      },
    },
    required: ['url'],
  },
  handler: async ({ url }) => {
    await assertSafeUrl(url);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AI-Transform/1.0' },
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) await assertSafeUrl(location);
      throw new Error(`重定向到 ${location}，已拦截（防止 SSRF 绕过）`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    return text.slice(0, 5000);
  },
};
