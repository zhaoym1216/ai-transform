module.exports = {
  name: 'web_search',
  description: '搜索互联网获取实时信息',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      limit: { type: 'number', description: '返回条数，默认5' },
    },
    required: ['query'],
  },
  handler: async ({ query, limit = 5 }) => {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
    );
    if (!res.ok) throw new Error(`搜索失败: HTTP ${res.status}`);
    const html = await res.text();
    const blocks = html.split(/class="result\s/g).slice(1, limit + 1);
    const results = blocks
      .map((block) => {
        const titleMatch = block.match(
          /class="result__a"[^>]*>([\s\S]*?)<\/a>/,
        );
        const snippetMatch = block.match(
          /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
        );
        const title = titleMatch
          ? titleMatch[1].replace(/<[^>]*>/g, '').trim()
          : '';
        const snippet = snippetMatch
          ? snippetMatch[1].replace(/<[^>]*>/g, '').trim()
          : '';
        return title ? `${title}${snippet ? '\n' + snippet : ''}` : null;
      })
      .filter(Boolean);
    return results.length ? results.join('\n\n') : '未找到相关结果';
  },
};
