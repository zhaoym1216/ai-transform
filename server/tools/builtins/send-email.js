const nodemailer = require('nodemailer');

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
};
