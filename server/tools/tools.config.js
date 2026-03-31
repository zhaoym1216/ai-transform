const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

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

function getMailTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

module.exports = {
  maxRounds: 5,
  maxTokens: 4096,
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
    {
      name: 'get_current_time',
      description: '获取当前日期和时间',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: '时区，如 "Asia/Shanghai"、"UTC"，默认系统时区',
          },
        },
      },
      handler: async ({ timezone } = {}) => {
        const d = new Date();
        return timezone
          ? d.toLocaleString('zh-CN', { timeZone: timezone })
          : d.toLocaleString('zh-CN');
      },
    },
    {
      name: 'calculate',
      description: '计算数学表达式，支持加减乘除、幂运算等',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '数学表达式，如 "2 * (3 + 4)" 或 "2^10"',
          },
        },
        required: ['expression'],
      },
      handler: async ({ expression }) => {
        const sanitized = expression.replace(/[^0-9+\-*/().%\s^]/g, '');
        const result = new Function(`return (${sanitized.replace(/\^/g, '**')})`)();
        return String(result);
      },
    },
    {
      name: 'fetch_webpage',
      description: '抓取指定 URL 的网页内容并返回文本（最多 5000 字符）',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要抓取的 URL 地址',
          },
        },
        required: ['url'],
      },
      handler: async ({ url }) => {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'AI-Transform/1.0' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const text = await res.text();
        return text.slice(0, 5000);
      },
    },
    {
      name: 'web_search',
      description: '搜索互联网获取实时信息',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '返回条数，默认5' },
        },
        required: ['query'],
      },
      handler: async ({ query, limit = 5 }) => {
        const res = await fetch(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          },
        );
        if (!res.ok) throw new Error(`搜索失败: HTTP ${res.status}`);
        const html = await res.text();
        const blocks = html.split(/class="result\s/g).slice(1, limit + 1);
        const results = blocks
          .map((block) => {
            const titleMatch = block.match(
              /class="result__a"[^>]*>([\s\S]*?)<\/a>/,
            );
            const snippetMatch = block.match(
              /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
            );
            const title = titleMatch
              ? titleMatch[1].replace(/<[^>]*>/g, '').trim()
              : '';
            const snippet = snippetMatch
              ? snippetMatch[1].replace(/<[^>]*>/g, '').trim()
              : '';
            return title ? `${title}${snippet ? '\n' + snippet : ''}` : null;
          })
          .filter(Boolean);
        return results.length ? results.join('\n\n') : '未找到相关结果';
      },
    },
    {
      name: 'send_email',
      description:
        '发送电子邮件。支持纯文本和 HTML 格式，可发送给多个收件人，可添加抄送和密送',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: '收件人邮箱地址，多个地址用逗号分隔',
          },
          subject: {
            type: 'string',
            description: '邮件主题',
          },
          body: {
            type: 'string',
            description: '邮件正文内容（纯文本）',
          },
          html: {
            type: 'string',
            description: '邮件 HTML 正文（可选，提供时优先使用 HTML 渲染）',
          },
          cc: {
            type: 'string',
            description: '抄送地址，多个用逗号分隔（可选）',
          },
          bcc: {
            type: 'string',
            description: '密送地址，多个用逗号分隔（可选）',
          },
        },
        required: ['to', 'subject', 'body'],
      },
      handler: async ({ to, subject, body, html, cc, bcc }) => {
        const transporter = getMailTransporter();
        if (!transporter) {
          throw new Error('邮件服务未配置，请在 .env 中设置 SMTP_HOST 等参数');
        }

        const signature = '\n\n— Sent via AI Agent · Crafted by zyiming';
        const textBody = body + signature;
        const htmlSignature = [
          '<br>',
          '<table cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e0e0e0;padding-top:12px;">',
          '  <tr>',
          '    <td style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">',
          '      <span style="font-size:13px;color:#555;letter-spacing:0.3px;">',
          '        Sent via <strong style="color:#333;">AI Agent</strong>',
          '      </span>',
          '      <br>',
          '      <span style="font-size:11px;color:#999;letter-spacing:0.2px;">',
          '        Crafted by zyiming',
          '      </span>',
          '    </td>',
          '  </tr>',
          '</table>',
        ].join('\n');
        const htmlBody = html ? html + htmlSignature : undefined;

        const mailOptions = {
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to,
          subject,
          text: textBody,
        };
        if (htmlBody) mailOptions.html = htmlBody;
        if (cc) mailOptions.cc = cc;
        if (bcc) mailOptions.bcc = bcc;

        const info = await transporter.sendMail(mailOptions);
        return `邮件发送成功，Message-ID: ${info.messageId}`;
      },
    },
    {
      name: 'read_inbox',
      description:
        '读取收件箱邮件列表。可指定读取数量和邮箱文件夹，返回发件人、主题、时间和正文摘要',
      parameters: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description: '读取邮件数量，默认 5',
          },
          folder: {
            type: 'string',
            description: '邮箱文件夹，默认 "INBOX"',
          },
          unseen_only: {
            type: 'boolean',
            description: '是否只读取未读邮件，默认 false',
          },
        },
      },
      handler: async ({ count = 5, folder = 'INBOX', unseen_only = false } = {}) => {
        const host = process.env.IMAP_HOST;
        if (!host) {
          throw new Error('IMAP 未配置，请在 .env 中设置 IMAP_HOST 等参数');
        }

        const client = new ImapFlow({
          host,
          port: Number(process.env.IMAP_PORT) || 993,
          secure: process.env.IMAP_SECURE !== 'false',
          auth: {
            user: process.env.IMAP_USER,
            pass: process.env.IMAP_PASS,
          },
          logger: false,
        });

        await client.connect();

        try {
          const lock = await client.getMailboxLock(folder);
          try {
            const mailbox = client.mailbox;
            const total = mailbox.exists;
            if (total === 0) return '收件箱为空';

            let messages = [];

            if (unseen_only) {
              for await (const msg of client.fetch({ seen: false }, {
                envelope: true, source: true,
              })) {
                messages.push(msg);
                if (messages.length >= count) break;
              }
            } else {
              const start = Math.max(1, total - count + 1);
              for await (const msg of client.fetch(`${start}:*`, {
                envelope: true, source: true,
              })) {
                messages.push(msg);
              }
            }

            if (messages.length === 0) {
              return unseen_only ? '没有未读邮件' : '收件箱为空';
            }

            messages.reverse();

            const results = [];
            for (const msg of messages) {
              const envelope = msg.envelope;
              let bodyText = '';

              if (msg.source) {
                try {
                  const parsed = await simpleParser(msg.source);
                  bodyText = (parsed.text || '').slice(0, 500);
                } catch {}
              }

              const from = envelope.from?.[0]
                ? `${envelope.from[0].name || ''} <${envelope.from[0].address}>`
                : '未知';

              results.push(
                `📧 ${envelope.subject || '(无主题)'}` +
                `\n   发件人: ${from}` +
                `\n   时间: ${envelope.date ? new Date(envelope.date).toLocaleString('zh-CN') : '未知'}` +
                `\n   摘要: ${bodyText ? bodyText.replace(/\n+/g, ' ').slice(0, 200) : '(无内容)'}`,
              );
            }

            return results.join('\n\n');
          } finally {
            lock.release();
          }
        } finally {
          await client.logout();
        }
      },
    },
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
    //   "url": "http://postservice-test-mcp-function.faas.ctripcorp.com/mcp",
    //   "headers": {
    //     "x-bbzai-mcp-token": "ada_3fd8df6557981050935323a40c5560b30645daa7fa13815e69acdc6df871968a",
    //     "smarthub-mcp-source": "hotel-order-offline-nfes"
    //   },
    //   "type": "streamable-http"
    // }
    // "feishu-mcp": {
    //   "command": "npx",
    //   "args": ["-y", "feishu-mcp@0.3.1", "--stdio"],
    //   "env": {
    //     "FEISHU_APP_ID": "cli_a83026feb2ab1013",
    //     "FEISHU_APP_SECRET": "VBdFcF25cVnGxRSfXc65edqleH8BALEQ",
    //     "FEISHU_AUTH_TYPE": "user",
    //     "FEISHU_ENABLED_MODULES": "all",
    //     "FEISHU_USER_KEY": "ou_7bed9c2b27d2909d4637e921c58b86d1"
    //   }
    // }
  },
};
