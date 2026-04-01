const memoryStore = require('../memory-store');

module.exports = {
  name: 'memory_delete',
  riskLevel: 'confirm',
  description: '删除一条持久记忆。需要提供记忆的 id（可通过 memory_read 查询获得）。',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '要删除的记忆 id',
      },
    },
    required: ['id'],
  },
  handler: async ({ id }) => {
    const removed = await memoryStore.remove(id);
    const total = memoryStore.count();
    return `记忆已删除：[${removed.id}] ${removed.content} — 剩余 ${total} 条记忆`;
  },
};
