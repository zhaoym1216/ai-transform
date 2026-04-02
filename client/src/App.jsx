import { useState, useRef, useEffect, useCallback } from 'react';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import { fetchReactStream, confirmToolCall, fetchScheduleRestoreStatus } from './api';
import './App.css';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [scheduleRestore, setScheduleRestore] = useState({
    pending: false,
    enabledTaskCount: 0,
    runnerPaused: false,
  });
  const controllerRef = useRef(null);
  const bottomRef = useRef(null);

  const refreshScheduleRestore = useCallback(async () => {
    try {
      const s = await fetchScheduleRestoreStatus();
      setScheduleRestore(s);
    } catch {
      /* 后端未起或网络错误时忽略 */
    }
  }, []);

  useEffect(() => {
    refreshScheduleRestore();
    const t = setInterval(refreshScheduleRestore, 30_000);
    return () => clearInterval(t);
  }, [refreshScheduleRestore]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const updateAssistant = (updater) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = { ...next[next.length - 1] };
      const parts = [...(last.parts || [])];
      updater(parts);
      last.parts = parts;
      next[next.length - 1] = last;
      return next;
    });
  };

  const handleConfirm = useCallback(async (confirmId, approved) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let m = next.length - 1; m >= 0; m--) {
        const msg = next[m];
        if (msg.role !== 'assistant' || !msg.parts) continue;
        const parts = [...msg.parts];
        let found = false;
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].type === 'tool_confirm' && parts[i].confirmId === confirmId) {
            parts[i] = { ...parts[i], status: approved ? 'approved' : 'denied' };
            found = true;
            break;
          }
        }
        if (found) {
          next[m] = { ...msg, parts };
          break;
        }
      }
      return next;
    });

    try {
      await confirmToolCall(confirmId, approved);
    } catch (err) {
      console.error('Confirm failed:', err);
      setError(`确认操作失败: ${err.message}`);
    }
  }, []);

  const handleSend = async (text) => {
    if (streaming) return;

    const userMsg = { role: 'user', content: text };

    const apiMessages = [
      ...messages.map((msg) => {
        if (msg.role === 'user') return { role: 'user', content: msg.content };
        const answer = msg.parts?.find((p) => p.type === 'answer');
        return { role: 'assistant', content: answer?.content || '' };
      }),
      { role: 'user', content: text },
    ];

    setMessages((prev) => [...prev, userMsg, { role: 'assistant', parts: [] }]);
    setStreaming(true);
    setError('');

    const controller = new AbortController();
    controllerRef.current = controller;

    await fetchReactStream(apiMessages, {
      signal: controller.signal,
      onEvent: (event) => {
        switch (event.type) {
          case 'step_start':
            updateAssistant((parts) => {
              parts.push({ type: 'thinking', content: '', round: event.round });
            });
            break;

          case 'delta':
            updateAssistant((parts) => {
              const last = parts[parts.length - 1];
              if (last) parts[parts.length - 1] = { ...last, content: last.content + event.content };
            });
            break;

          case 'step_end':
            if (!event.hasToolCalls) {
              updateAssistant((parts) => {
                const last = parts[parts.length - 1];
                if (last) parts[parts.length - 1] = { ...last, type: 'answer' };
              });
            }
            break;

          case 'tool_call':
            updateAssistant((parts) => {
              parts.push({
                type: 'tool_call',
                id: event.id,
                name: event.name,
                arguments: event.arguments,
                riskLevel: event.riskLevel || 'normal',
                confirmStatus: null,
                result: null,
                isError: false,
              });
            });
            break;

          case 'tool_confirm_request':
            updateAssistant((parts) => {
              for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i].type === 'tool_call' && parts[i].id === event.toolCallId) {
                  parts[i] = { ...parts[i], confirmStatus: 'pending' };
                  break;
                }
              }
              parts.push({
                type: 'tool_confirm',
                confirmId: event.confirmId,
                toolCallId: event.toolCallId,
                name: event.name,
                arguments: event.arguments,
                riskLevel: event.riskLevel,
                message: event.message,
                status: 'pending',
              });
            });
            break;

          case 'tool_confirm_result':
            updateAssistant((parts) => {
              for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i].type === 'tool_confirm' && parts[i].confirmId === event.confirmId) {
                  parts[i] = { ...parts[i], status: event.approved ? 'approved' : 'denied' };
                  break;
                }
                if (parts[i].type === 'tool_call' && parts[i].id === event.toolCallId) {
                  parts[i] = {
                    ...parts[i],
                    confirmStatus: event.approved ? 'approved' : 'denied',
                  };
                  break;
                }
              }
            });
            break;

          case 'tool_result':
            updateAssistant((parts) => {
              for (let i = parts.length - 1; i >= 0; i--) {
                if (parts[i].type === 'tool_call' && parts[i].id === event.id) {
                  parts[i] = { ...parts[i], result: event.content, isError: event.isError, confirmStatus: null };
                  break;
                }
              }
            });
            break;

          case 'error':
            setError(event.message);
            break;

          default:
            break;
        }
      },
      onDone: () => {
        setStreaming(false);
        refreshScheduleRestore();
      },
      onError: (err) => {
        setError(err.message);
        setStreaming(false);
      },
    });
  };

  const handleStop = () => {
    controllerRef.current?.abort();
    setStreaming(false);
  };

  const handleClear = () => {
    if (streaming) handleStop();
    setMessages([]);
    setError('');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1>AI Transform</h1>
          <span className="badge">ReAct</span>
        </div>
        {messages.length > 0 && (
          <button className="btn-clear" onClick={handleClear}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            清空对话
          </button>
        )}
      </header>

      {scheduleRestore.pending && (
        <div className="schedule-restore-banner" role="status">
          <span className="schedule-restore-banner__dot" aria-hidden />
          <div className="schedule-restore-banner__text">
            <strong>定时任务待确认</strong>
            <span>
              服务重启后已有 {scheduleRestore.enabledTaskCount} 个启用任务处于调度暂停。请在对话中说明是否恢复自动执行（助手将调用
              schedule_restore_ack）。
            </span>
          </div>
        </div>
      )}

      <main className="chat-area">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2>ReAct Agent</h2>
            <p>支持工具调用的智能对话，输入问题开始</p>
          </div>
        ) : (
          <div className="messages">
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                message={msg}
                isStreaming={streaming && i === messages.length - 1 && msg.role === 'assistant'}
                onConfirm={handleConfirm}
              />
            ))}
            {error && <div className="error-banner">{error}</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <ChatInput onSend={handleSend} onStop={handleStop} loading={streaming} />
    </div>
  );
}
