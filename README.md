# AI Transform — ReAct Agent

基于 React + Node.js 的 ReAct 模式 AI 问答应用，支持工具调用、MCP 服务器和流式输出。

## 项目结构

```
ai-transform/
├── server/
│   ├── index.js                # Express 入口，启动时初始化工具注册表
│   ├── config.js               # 全局配置（baseUrl / apiKey / model）
│   ├── react-agent.js          # ReAct 编排器（推理-行动循环）
│   ├── routes/
│   │   └── chat.js             # SSE 流式接口
│   └── tools/
│       ├── tools.config.js     # 工具定义 + MCP 服务器配置
│       ├── registry.js         # 工具注册表（内置 + MCP）
│       └── mcp-client.js       # MCP 协议客户端
├── client/
│   └── src/
│       ├── App.jsx             # 主界面
│       ├── api.js              # SSE 事件流解析
│       └── components/
│           ├── ChatMessage.jsx # 消息渲染（思考/工具/回答）
│           └── ChatInput.jsx   # 输入框
├── .env                        # 环境变量
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm run install:all
```

### 2. 配置环境变量

编辑 `.env`：

```env
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-your-api-key-here
AI_MODEL=gpt-4o
PORT=3001
```

支持任何兼容 OpenAI API 格式的服务。

### 3. 启动

```bash
npm run dev
```

访问 `http://localhost:5173`。

## ReAct 模式

每次用户提问，Agent 进入 **推理-行动** 循环：

1. **Thinking** — LLM 分析问题，决定是否调用工具
2. **Action** — 调用工具并获取结果
3. **Observation** — 工具结果反馈给 LLM
4. 重复 1-3，最多 5 轮（可配置）
5. **Answer** — LLM 给出最终回答

整个过程通过 SSE 实时流式推送到前端。

## 配置工具

编辑 `server/tools/tools.config.js`：

### 内置工具

```js
tools: [
  {
    name: 'my_tool',
    description: '工具描述',
    parameters: {
      type: 'object',
      properties: { /* JSON Schema */ },
      required: ['param1'],
    },
    handler: async ({ param1 }) => {
      return '工具返回结果';
    },
  },
]
```

### MCP 服务器

```js
mcpServers: {
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    env: {},
  },
}
```

MCP 服务器的工具会自动注册，名称格式为 `serverName__toolName`。

## SSE 事件协议

| 事件类型      | 字段                                     | 说明           |
| ------------- | ---------------------------------------- | -------------- |
| `step_start`  | `round`, `maxRounds`                     | 新一轮推理开始 |
| `delta`       | `content`                                | LLM 流式输出   |
| `step_end`    | `round`, `hasToolCalls`                  | 本轮结束       |
| `tool_call`   | `id`, `name`, `arguments`                | 工具调用       |
| `tool_result` | `id`, `name`, `content`, `isError`       | 工具结果       |
| `error`       | `message`                                | 错误           |
| `done`        | —                                        | 完成           |
