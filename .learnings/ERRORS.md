# Errors Log

Command failures, exceptions, and unexpected behaviors.

---

## [ERR-20260327-001] create-vite Node.js 版本不兼容

**Logged**: 2026-03-27T15:46:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
`npm create vite@latest` 失败，`create-vite@9.0.3` 要求 Node.js `^20.19.0 || >=22.12.0`

### Error
```
SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
    at ModuleJob._instantiate (node:internal/modules/esm/module_job:132:21)
npm ERR! code 1
```

### Context
- 执行 `npm create vite@latest client -- --template react`
- 当前 Node.js 版本 v20.11.1
- `styleText` 是 Node.js v20.12.0+ 新增的 API

### Suggested Fix
升级 Node.js 到 >=20.19.0，或手动创建 Vite 项目结构绕过脚手架

### Resolution
- **Resolved**: 2026-03-27T15:50:00+08:00
- **Notes**: 手动创建 client 目录和所有配置文件绕过了脚手架

### Metadata
- Reproducible: yes
- Related Files: client/package.json, client/vite.config.js
- Tags: node-version, vite, toolchain

---

## [ERR-20260327-002] feishu-mcp 进程启动崩溃

**Logged**: 2026-03-27T17:30:00+08:00
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
`feishu-mcp@0.3.2` 要求 Node.js `^20.17.0`，当前 v20.11.1 导致进程启动即崩溃（exit code 1），MCP 客户端未检测到崩溃，等待 initialize 响应直到超时

### Error
```
MCP [feishu-mcp] stderr: npm WARN EBADENGINE Unsupported engine {
  package: 'feishu-mcp@0.3.2',
  required: { node: '^20.17.0' },
  current: { node: 'v20.11.1', npm: '10.2.4' }
}
MCP [feishu-mcp] connect failed: MCP [feishu-mcp] initialize timed out
```

### Context
- 通过 `npx -y feishu-mcp@latest --stdio` 启动 MCP 服务器
- 诊断发现进程 stdout 无任何输出，直接 exit code 1
- MCP 客户端缺少进程退出检测，导致无意义的超时等待

### Suggested Fix
1. 升级 Node.js 到 >=20.17.0
2. MCP 客户端需监听子进程 close 事件并立即 reject 等待中的请求（已修复）

### Resolution
- **Resolved**: 2026-03-27T17:45:00+08:00（客户端侧已修复，Node.js 版本待用户升级）
- **Notes**: 重写 mcp-client.js 增加进程崩溃检测、EBADENGINE 提示
- **See Also**: ERR-20260327-001

### Metadata
- Reproducible: yes
- Related Files: server/tools/mcp-client.js, server/tools/tools.config.js
- Tags: mcp, node-version, child-process, feishu

---

## [ERR-20260327-003] req.on('close') 导致上游请求被提前中止

**Logged**: 2026-03-27T16:15:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
使用 `req.on('close')` 监听客户端断开来中止上游 AI API 请求，导致正常对话也无法收到回复。`close` 事件在请求体被 `express.json()` 消费后可能提前触发，使上游 fetch 被立即 abort

### Error
```
（无错误日志 —— AbortError 被静默 catch，表现为前端完全无回复）
```

### Context
- Express 中间件 `express.json()` 消费请求体后，`req`（IncomingMessage readable）流结束
- `req.on('close')` 可能在流结束后触发，而非仅在 TCP 连接断开时触发
- 上游 fetch 的 AbortError 被 `catch` 静默处理，服务端无任何日志输出

### Suggested Fix
使用 `res.on('close')` + `res.writableFinished` 守卫替代 `req.on('close')`

### Resolution
- **Resolved**: 2026-03-27T16:20:00+08:00
- **Notes**: 改为 `res.on('close', () => { if (!res.writableFinished) upstreamController.abort(); })`

### Metadata
- Reproducible: yes
- Related Files: server/routes/chat.js
- Tags: express, sse, abort, http-lifecycle

---
