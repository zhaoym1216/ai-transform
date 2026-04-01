import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import './ChatMessage.css';

function ThinkingBlock({ content, round, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!content) return null;

  return (
    <div className={`thinking-block ${open ? 'open' : ''}`}>
      <button className="thinking-toggle" onClick={() => setOpen(!open)}>
        <svg className="toggle-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="thinking-label">思考过程</span>
        {round && <span className="thinking-round">Round {round}</span>}
      </button>
      {open && <div className="thinking-content">{content}</div>}
    </div>
  );
}

function ToolCallBlock({ name, arguments: args, result, isError, riskLevel, confirmStatus }) {
  const [expanded, setExpanded] = useState(false);

  const needsConfirm = riskLevel && riskLevel !== 'normal';
  const isPending = needsConfirm && confirmStatus === 'pending';
  const isDenied = needsConfirm && confirmStatus === 'denied';

  let statusText = result === null ? '执行中...' : isError ? '失败' : '完成';
  let statusClass = result === null ? 'running' : isError ? 'error' : 'success';

  if (isPending) {
    statusText = '等待确认...';
    statusClass = 'waiting';
  } else if (isDenied) {
    statusText = '已拒绝';
    statusClass = 'error';
  }

  return (
    <div className={`tool-call-block ${isPending ? 'tool-call-pending' : ''}`}>
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="tool-name">{name}</span>
        {needsConfirm && (
          <span className={`tool-risk-badge risk-${riskLevel}`}>
            {riskLevel === 'dangerous' ? '危险' : '需确认'}
          </span>
        )}
        <span className={`tool-status ${statusClass}`}>
          {statusText}
        </span>
      </div>

      {expanded && args && Object.keys(args).length > 0 && (
        <div className="tool-args">
          <span className="tool-section-label">参数</span>
          <pre>{JSON.stringify(args, null, 2)}</pre>
        </div>
      )}

      {result !== null && (
        <div className={`tool-result ${isError ? 'tool-result-error' : ''}`}>
          <span className="tool-section-label">结果</span>
          <pre>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function ToolConfirmBlock({ confirmId, name, arguments: args, riskLevel, message, status, onConfirm }) {
  const isDangerous = riskLevel === 'dangerous';
  const isPending = status === 'pending';

  return (
    <div className={`tool-confirm-block ${isDangerous ? 'confirm-dangerous' : 'confirm-normal'}`}>
      <div className="confirm-header">
        <div className="confirm-icon">
          {isDangerous ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>
        <div className="confirm-text">
          <div className="confirm-title">{message}</div>
          <div className="confirm-tool-name">
            工具：<code>{name}</code>
          </div>
        </div>
      </div>

      {args && Object.keys(args).length > 0 && (
        <div className="confirm-args">
          <span className="tool-section-label">执行参数</span>
          <pre>{JSON.stringify(args, null, 2)}</pre>
        </div>
      )}

      {isPending ? (
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-deny" onClick={() => onConfirm(confirmId, false)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            拒绝
          </button>
          <button className="confirm-btn confirm-btn-approve" onClick={() => onConfirm(confirmId, true)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {isDangerous ? '我了解风险，确认执行' : '确认执行'}
          </button>
        </div>
      ) : (
        <div className={`confirm-resolved ${status === 'approved' ? 'resolved-approved' : 'resolved-denied'}`}>
          {status === 'approved' ? '已批准执行' : '已拒绝执行'}
        </div>
      )}
    </div>
  );
}

function AnswerBlock({ content, isStreaming }) {
  return (
    <div className="answer-block markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }) {
            return inline ? (
              <code className="inline-code" {...props}>{children}</code>
            ) : (
              <pre className="code-block">
                <code className={className} {...props}>{children}</code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="cursor-blink" />}
    </div>
  );
}

export default function ChatMessage({ message, isStreaming, onConfirm }) {
  const { role } = message;
  const isUser = role === 'user';

  if (isUser) {
    return (
      <div className="msg-row msg-user">
        <div className="msg-avatar user-avatar">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div className="msg-bubble user-bubble">
          <p>{message.content}</p>
        </div>
      </div>
    );
  }

  const parts = message.parts || [];
  const hasSteps = parts.some((p) => p.type === 'thinking' || p.type === 'tool_call');

  return (
    <div className="msg-row msg-ai">
      <div className="msg-avatar ai-avatar">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="msg-content">
        {parts.map((part, i) => {
          const isLast = i === parts.length - 1;
          switch (part.type) {
            case 'thinking':
              return (
                <ThinkingBlock
                  key={i}
                  content={part.content}
                  round={hasSteps ? part.round : null}
                  defaultOpen={isStreaming && isLast}
                />
              );
            case 'tool_call':
              return <ToolCallBlock key={i} {...part} />;
            case 'tool_confirm':
              return <ToolConfirmBlock key={i} {...part} onConfirm={onConfirm} />;
            case 'answer':
              return <AnswerBlock key={i} content={part.content} isStreaming={isStreaming && isLast} />;
            default:
              return null;
          }
        })}
        {parts.length === 0 && isStreaming && <span className="cursor-blink" />}
      </div>
    </div>
  );
}
