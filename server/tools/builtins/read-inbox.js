const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

module.exports = {
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
            } catch { }
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
};
