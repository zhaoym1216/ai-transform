/**
 * ReAct Agent 工具与 MCP 配置
 *
 * - tools:      内置工具列表，每个工具包含 name / description / parameters / handler
 * - mcpServers: MCP 服务器配置，key 为服务名，会自动加载其提供的工具
 * - maxRounds:  ReAct 最大推理轮次（每轮 = 一次 LLM 调用 + 可能的工具执行）
 * - maxTokens:  LLM 最大输出 token 数
 * - maxToolCalls: 最大工具调用次数
 * - turnTimeout: 每轮超时时间
 */

const memoryStore = require('./memory-store');

const BASE_PROMPT = [
  '你是一个有用的 AI 助手，拥有工具调用能力。',
  '当你需要实时信息（如当前时间、网页内容）时，请使用提供的工具。',
  '当你能直接回答时，无需调用工具。',
  '请逐步思考并给出清晰的回答。',
  '\n\n【记忆工具使用指引】\n',
  '当用户表达偏好、要求你记住某事、或提供重要个人信息时，你应主动使用 memory_write 工具保存。',
  '当你不确定用户的偏好或历史信息时，可以使用 memory_read 工具查询。',
  'core 级记忆用于最重要的持久指令和偏好，请谨慎使用，避免滥用。',
  'important 级用于重要上下文和关键事实，normal 和 low 级用于一般备忘和临时记录。',
  '\n\n【定时任务】\n',
  '使用 schedule_create / schedule_list / schedule_update / schedule_cancel 管理 Cron 定时任务。',
  '若任务可能调用需确认或危险工具，须将工具名写入 preApprovedTools，并在对话中取得用户明确同意。',
  '服务重启后若存在已启用任务，须等用户在对话中确认后调用 schedule_restore_ack 才能恢复调度。',
].join('');

module.exports = {
  maxRounds: 5,
  maxTokens: 10000,
  maxToolCalls: 10,
  turnTimeout: 30000,

  async systemPrompt() {
    const coreMemories = memoryStore.getByImportance('core');

    if (coreMemories.length === 0) return BASE_PROMPT;

    const memoryBlock = coreMemories.map((m) => `- ${m.content}`).join('\n');
    return `${BASE_PROMPT}\n\n【核心记忆 - 请始终遵循】\n${memoryBlock}`;
  },

  // ─── 内置工具 ───────────────────────────────────────────────
  tools: [
    require('./builtins/get-current-time'),
    require('./builtins/calculate'),
    require('./builtins/fetch-webpage'),
    require('./builtins/web-search'),
    require('./builtins/send-email'),
    require('./builtins/read-inbox'),
    require('./builtins/memory-write'),
    require('./builtins/memory-read'),
    require('./builtins/memory-delete'),
    require('./builtins/schedule-create'),
    require('./builtins/schedule-list'),
    require('./builtins/schedule-update'),
    require('./builtins/schedule-cancel'),
    require('./builtins/schedule-restore-ack'),
  ],

  // ─── MCP 服务器配置 ──────────────────────────────────────────
  // 取消注释即可启用对应的 MCP 服务器，工具会自动注册
  mcpServers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './public'],
      env: {},
    },
    // "smarthub-mcp": {
    //   "url": process.env.SMARTHUB_MCP_URL,
    //   "headers": {
    //     "x-bbzai-mcp-token": process.env.SMARTHUB_MCP_TOKEN,
    //     "smarthub-mcp-source": process.env.SMARTHUB_MCP_SOURCE
    //   },
    //   "type": "streamable-http"
    // }
    // "feishu-mcp": {
    //   "command": "npx",
    //   "args": ["-y", "feishu-mcp@0.3.1", "--stdio"],
    //   "env": {
    //     "FEISHU_APP_ID": process.env.FEISHU_APP_ID,
    //     "FEISHU_APP_SECRET": process.env.FEISHU_APP_SECRET,
    //     "FEISHU_AUTH_TYPE": "user",
    //     "FEISHU_ENABLED_MODULES": "all",
    //     "FEISHU_USER_KEY": process.env.FEISHU_USER_KEY
    //   }
    // }
  },
};
