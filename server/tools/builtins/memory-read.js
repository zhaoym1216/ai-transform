const memoryStore = require('../memory-store');

module.exports = {
  name: 'memory_read',
  riskLevel: 'normal',
  description:
    '读取持久记忆。可按重要程度、分类、标签、关键词筛选。用于回忆用户偏好、查找之前保存的信息等。',
  parameters: {
    type: 'object',
    properties: {
      importance: {
        type: 'string',
        enum: ['core', 'important', 'normal', 'low'],
        description: '按重要程度筛选',
      },
      category: {
        type: 'string',
        enum: ['preference', 'fact', 'instruction', 'note', 'schedule'],
        description: '按分类筛选',
      },
      keyword: {
        type: 'string',
        description: '关键词搜索（匹配记忆内容和标签）',
      },
      limit: {
        type: 'number',
        description: '返回条数上限，默认 20',
      },
    },
    required: [],
  },
  handler: async ({ importance, category, keyword, limit } = {}) => {
    const results = memoryStore.query({ importance, category, keyword, limit });

    if (results.length === 0) {
      return '未找到匹配的记忆。';
    }

    const lines = results.map(
      (m) =>
        `[${m.id}] (${m.importance}/${m.category}) ${m.content}` +
        (m.tags.length ? ` #${m.tags.join(' #')}` : '') +
        ` — ${m.updatedAt}`,
    );

    const total = memoryStore.count();
    return `找到 ${results.length} 条记忆（共 ${total} 条）：\n${lines.join('\n')}`;
  },
};
