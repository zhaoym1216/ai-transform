# Learnings Log

Captured learnings, corrections, and discoveries. Review before major tasks.

---

## [LRN-20260327-001] correction

**Logged**: 2026-03-27T16:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
async 函数通过 await 返回值会导致调用方无法在执行期间获取该值（AbortController 反模式）

### Details
`fetchChatStream` 是 async 函数，内部创建 `AbortController` 并在函数末尾 return。调用方使用 `controllerRef.current = await fetchChatStream(...)` 试图获取 controller，但 `await` 会等待整个流式传输完成后才赋值。因此在流式输出期间，`controllerRef.current` 始终为 null，中止按钮无效。

### Suggested Action
需要在函数外部使用资源时，应由调用方创建并传入（依赖注入），而非由 async 函数内部创建并返回：
```js
// 正确：调用方创建 controller，传入 signal
const controller = new AbortController();
controllerRef.current = controller;
await fetchStream({ signal: controller.signal, ... });
```

### Metadata
- Source: user_feedback
- Related Files: client/src/api.js, client/src/App.jsx
- Tags: async-await, abort-controller, streaming, react-pattern

---

## [LRN-20260327-002] correction

**Logged**: 2026-03-27T16:10:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
重构后残留的未定义变量引用（`return controller`）导致 ReferenceError 被静默吞掉

### Details
将 `AbortController` 从 `fetchChatStream` 内部移到外部后，函数内仍保留了 `return controller;`。当 SSE 收到 `[DONE]` 时，`onDone()` 先正常调用，随后 `return controller` 抛出 `ReferenceError`（controller 未定义），被 catch 捕获后调用 `onError`。表现为流式输出正常结束后突然报错。

### Suggested Action
重构涉及变量作用域变更时，全局搜索旧变量名确认所有引用都已更新。对于返回值的清理尤其容易遗漏。

### Metadata
- Source: user_feedback
- Related Files: client/src/api.js
- Tags: refactoring, dead-code, reference-error

---

## [LRN-20260327-003] best_practice

**Logged**: 2026-03-27T16:20:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
Express SSE 场景中，检测客户端断开应使用 `res.on('close')` + `writableFinished`，而非 `req.on('close')`

### Details
在 Express 中：
- `req`（IncomingMessage）的 `close` 事件在请求体完全消费后可能触发，不仅限于 TCP 断开
- `res`（ServerResponse）的 `close` 事件在底层连接关闭时触发
- `res.writableFinished` 为 `true` 表示响应已正常完成（`res.end()` 后），为 `false` 表示客户端提前断开

正确模式：
```js
const controller = new AbortController();
res.on('close', () => {
  if (!res.writableFinished) controller.abort();
});
```

### Suggested Action
所有 SSE/长连接路由中统一使用此模式检测客户端断开

### Metadata
- Source: error
- Related Files: server/routes/chat.js
- Tags: express, sse, http-lifecycle, abort-controller
- See Also: ERR-20260327-003

---

## [LRN-20260327-004] best_practice

**Logged**: 2026-03-27T17:45:00+08:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
MCP 客户端必须监听子进程退出事件，否则进程崩溃时会无意义地等到超时

### Details
MCP 服务器通过 `child_process.spawn` 启动。如果进程因版本不兼容等原因启动即崩溃（exit code 非 0），但客户端没有监听 `close`/`exit` 事件，所有 pending 的 JSON-RPC 请求（如 `initialize`）会一直等到超时才失败，给出误导性的 "timed out" 错误。

修复要点：
1. 监听 `proc.on('close', code)` 事件
2. 进程退出时遍历 `pending` Map，逐个 reject
3. `_request` 方法在发送前检查 `_exited` 标志，立即拒绝
4. 解析 stderr 中的 `EBADENGINE` 关键字，给出 Node.js 升级提示

### Suggested Action
任何通过子进程通信的客户端（MCP、LSP 等）都应遵循此模式

### Metadata
- Source: error
- Related Files: server/tools/mcp-client.js
- Tags: mcp, child-process, error-handling, json-rpc
- See Also: ERR-20260327-002

---

## [LRN-20260327-005] best_practice

**Logged**: 2026-03-27T17:50:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
MCP Content-Length 帧解析需兼容 `\r\n` 和 `\n` 换行，且用字节长度匹配而非字符长度

### Details
MCP 协议规范使用 `Content-Length: N\r\n\r\n{body}` 分帧（类似 LSP）。实际问题：

1. **换行符差异**：部分 MCP 服务器实现可能使用 `\n\n` 而非 `\r\n\r\n`。`_drain()` 应同时检测两种分隔符。

2. **字节 vs 字符长度**：`Content-Length` 是字节长度，但 JavaScript 字符串的 `.length` 是字符数。多字节 UTF-8 字符（如中文）会导致 `string.length < byteLength`，使 `buffer.length < bodyStart + len` 永远为 true，解析器卡死。应使用 `Buffer.byteLength()` 比较。

### Suggested Action
```js
// 截取 body 时用 Buffer 精确按字节操作
const remaining = Buffer.from(this.buffer.slice(bodyStart));
const body = remaining.slice(0, len).toString();
this.buffer = remaining.slice(len).toString();
```

### Metadata
- Source: error
- Related Files: server/tools/mcp-client.js
- Tags: mcp, content-length, encoding, utf8, protocol-parsing

---

## [LRN-20260327-006] knowledge_gap

**Logged**: 2026-03-27T15:46:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
Node.js v20.11.1 缺少多个新版 API（`styleText` 等），导致依赖链中多个包不兼容

### Details
本项目环境 Node.js v20.11.1 遇到多次版本不兼容：
- `create-vite@9.0.3` 需要 `^20.19.0 || >=22.12.0`（使用 `node:util` 的 `styleText`）
- `feishu-mcp@0.3.2` 需要 `^20.17.0`

v20.11.1 是 2024 年 1 月的版本，很多 2025-2026 年发布的包已不再兼容。建议在项目 README 中注明最低 Node.js 版本要求，或在 package.json 中添加 `engines` 字段。

### Suggested Action
在 package.json 中添加：
```json
"engines": { "node": ">=20.17.0" }
```

### Metadata
- Source: error
- Related Files: package.json, .env
- Tags: node-version, compatibility, engines
- See Also: ERR-20260327-001, ERR-20260327-002

---
