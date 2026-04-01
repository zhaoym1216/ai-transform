const memoryStore = require('../memory-store');

module.exports = {
  name: 'memory_write',
  riskLevel: 'normal',
  description:
    '将重要信息写入持久记忆，支持新建和更新。用于记录用户偏好、重要事实、持久指令等需要跨对话保留的信息。',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '记忆内容，建议简洁明确',
      },
      importance: {
        type: 'string',
        enum: ['core', 'important', 'normal', 'low'],
        description:
          '重要程度：core=核心偏好/身份(始终生效), important=重要上下文(自动加载), normal=一般备忘, low=临时记录',
      },
      category: {
        type: 'string',
        enum: ['preference', 'fact', 'instruction', 'note'],
        description:
          '分类：preference=用户偏好, fact=事实信息, instruction=持久指令, note=一般笔记',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '标签，用于后续检索',
      },
      id: {
        type: 'string',
        description: '可选，传入已有记忆的 id 则更新该条记忆',
      },
    },
    required: ['content', 'importance'],
  },
  handler: async ({ content, importance, category, tags, id }) => {
    if (id) {
      const updated = await memoryStore.update(id, {
        content,
        importance,
        category,
        tags,
      });
      return `记忆已更新：[${updated.id}] ${updated.content} (${updated.importance})`;
    }

    const entry = await memoryStore.add({ content, importance, category, tags });
    const total = memoryStore.count();
    return `记忆已保存：[${entry.id}] ${entry.content} (${entry.importance}) — 当前共 ${total} 条记忆`;
  },
};
