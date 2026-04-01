const config = require('./config');
const toolRegistry = require('./tools/registry');
const toolsConfig = require('./tools/tools.config');
const memoryStore = require('./tools/memory-store');
const { createConfirmation } = require('./tools/confirmation');

const RISK_LABELS = {
  confirm: '需要确认',
  dangerous: '需要人工审批（危险操作）',
};

/**
 * SSE 事件协议：
 *   step_start          { round, maxRounds }
 *   delta               { content }
 *   step_end            { round, hasToolCalls }
 *   tool_call           { id, name, arguments, riskLevel }
 *   tool_confirm_request { confirmId, toolCallId, name, arguments, riskLevel, message }
 *   tool_confirm_result  { confirmId, toolCallId, approved }
 *   tool_result         { id, name, content, isError }
 *   error               { message }
 *   done                {}
 */
class ReactAgent {
  constructor({ writer, signal }) {
    this.writer = writer;
    this.signal = signal;
  }

  emit(event) {
    this.writer(event);
  }

  async run(userMessages) {
    const maxRounds = toolsConfig.maxRounds || 5;
    const maxToolCalls = toolsConfig.maxToolCalls || 10;
    const turnTimeout = toolsConfig.turnTimeout || 30000;
    const toolDefs = toolRegistry.getToolDefinitions();

    const systemPrompt = await toolsConfig.systemPrompt();
    const messages = [{ role: 'system', content: systemPrompt }];

    const importantMemories = memoryStore.getByImportance('important');
    if (importantMemories.length > 0) {
      const memBlock = importantMemories
        .map((m) => `- [${m.category || 'note'}] ${m.content}`)
        .join('\n');
      messages.push({
        role: 'system',
        content: `【重要记忆】以下是用户此前保存的重要信息，请在回答时参考：\n${memBlock}`,
      });
    }

    messages.push(...userMessages);

    let answered = false;
    let totalToolCalls = 0;

    for (let round = 1; round <= maxRounds; round++) {
      this.emit({ type: 'step_start', round, maxRounds });

      const result = await this._streamLLM(messages, toolDefs, turnTimeout);

      if (!result.toolCalls.length) {
        this.emit({ type: 'step_end', round, hasToolCalls: false });
        answered = true;
        break;
      }

      this.emit({ type: 'step_end', round, hasToolCalls: true });

      messages.push({
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      for (const tc of result.toolCalls) {
        if (totalToolCalls >= maxToolCalls) {
          const skipped = `已达到最大工具调用次数 (${maxToolCalls})，跳过本次调用`;
          this.emit({ type: 'tool_result', id: tc.id, name: tc.name, content: skipped, isError: true });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: skipped });
          continue;
        }

        const riskLevel = toolRegistry.getRiskLevel(tc.name);

        this.emit({
          type: 'tool_call',
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          riskLevel,
        });

        if (riskLevel !== 'normal') {
          const approved = await this._waitForConfirmation(tc, riskLevel);
          if (!approved) {
            const denied = '用户拒绝执行该操作';
            this.emit({ type: 'tool_result', id: tc.id, name: tc.name, content: denied, isError: true });
            messages.push({ role: 'tool', tool_call_id: tc.id, content: denied });
            totalToolCalls++;
            continue;
          }
        }

        let content;
        let isError = false;
        try {
          content = await toolRegistry.executeTool(tc.name, tc.arguments);
        } catch (err) {
          content = `Error: ${err.message}`;
          isError = true;
        }
        totalToolCalls++;

        this.emit({ type: 'tool_result', id: tc.id, name: tc.name, content, isError });

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: typeof content === 'string' ? content : JSON.stringify(content),
        });
      }
    }

    if (!answered) {
      const extraRound = maxRounds + 1;
      this.emit({ type: 'step_start', round: extraRound, maxRounds });
      await this._streamLLM(messages, [], turnTimeout);
      this.emit({ type: 'step_end', round: extraRound, hasToolCalls: false });
    }

    this.emit({ type: 'done' });
  }

  async _waitForConfirmation(tc, riskLevel) {
    const { id: confirmId, promise } = createConfirmation();

    this.emit({
      type: 'tool_confirm_request',
      confirmId,
      toolCallId: tc.id,
      name: tc.name,
      arguments: tc.arguments,
      riskLevel,
      message: RISK_LABELS[riskLevel] || '需要确认',
    });

    try {
      const approved = await promise;
      this.emit({ type: 'tool_confirm_result', confirmId, toolCallId: tc.id, approved });
      return approved;
    } catch {
      this.emit({ type: 'tool_confirm_result', confirmId, toolCallId: tc.id, approved: false });
      return false;
    }
  }

  async _streamLLM(messages, tools, turnTimeout) {
    const url = `${config.ai.baseUrl}/chat/completions`;
    const maxTokens = toolsConfig.maxTokens || 4096;

    const body = { model: config.ai.model, messages, stream: true, max_tokens: maxTokens };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), turnTimeout);
    const combinedSignal = this.signal
      ? AbortSignal.any([this.signal, timeoutController.signal])
      : timeoutController.signal;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (timeoutController.signal.aborted) {
        throw new Error(`LLM 调用超时 (${turnTimeout}ms)`);
      }
      throw err;
    }

    if (!res.ok) {
      clearTimeout(timer);
      const text = await res.text();
      throw new Error(`LLM API ${res.status}: ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolCallMap = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            content += choice.delta.content;
            this.emit({ type: 'delta', content: choice.delta.content });
          }

          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallMap[idx]) {
                toolCallMap[idx] = { id: '', name: '', arguments: '' };
              }
              if (tc.id) toolCallMap[idx].id = tc.id;
              if (tc.function?.name) toolCallMap[idx].name = tc.function.name;
              if (tc.function?.arguments != null)
                toolCallMap[idx].arguments += tc.function.arguments;
            }
          }
        } catch {
          // skip
        }
      }
    }

    clearTimeout(timer);

    const toolCalls = Object.values(toolCallMap).map((tc) => {
      try {
        tc.arguments = JSON.parse(tc.arguments || '{}');
      } catch {
        tc.arguments = {};
      }
      return tc;
    });

    return { content, toolCalls };
  }
}

module.exports = ReactAgent;
