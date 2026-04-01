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

module.exports = {
  maxRounds: 5,
  maxTokens: 10000,
  maxToolCalls: 10,
  turnTimeout: 30000,

  systemPrompt: [
    '你是一个有用的 AI 助手，拥有工具调用能力。',
    '当你需要实时信息（如当前时间、网页内容）时，请使用提供的工具。',
    '当你能直接回答时，无需调用工具。',
    '请逐步思考并给出清晰的回答。',
  ].join(''),

  // ─── 内置工具 ───────────────────────────────────────────────
  tools: [
    require('./builtins/get-current-time'),
    require('./builtins/calculate'),
    require('./builtins/fetch-webpage'),
    require('./builtins/web-search'),
    require('./builtins/send-email'),
    require('./builtins/read-inbox'),
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
