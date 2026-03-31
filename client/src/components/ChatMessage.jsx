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

function ToolCallBlock({ name, arguments: args, result, isError }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="tool-call-block">
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="tool-name">{name}</span>
        <span className={`tool-status ${result === null ? 'running' : isError ? 'error' : 'success'}`}>
          {result === null ? '执行中...' : isError ? '失败' : '完成'}
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

export default function ChatMessage({ message, isStreaming }) {
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
