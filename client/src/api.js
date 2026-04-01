/**
 * 连接后端 ReAct SSE 流
 *
 * 事件类型：
 *   step_start / delta / step_end / tool_call / tool_confirm_request /
 *   tool_confirm_result / tool_result / error / done
 */
export async function fetchReactStream(messages, { signal, onEvent, onDone, onError }) {
  try {
    const res = await fetch('/api/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.detail || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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

        try {
          const event = JSON.parse(data);
          if (event.type === 'done') {
            onDone();
            return;
          }
          onEvent(event);
        } catch {
          // skip
        }
      }
    }

    onDone();
  } catch (err) {
    if (err.name !== 'AbortError') {
      onError(err);
    }
  }
}

export async function confirmToolCall(confirmId, approved) {
  const res = await fetch('/api/chat/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmId, approved }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
