const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

class McpClient {
  constructor(name, serverConfig) {
    this.name = name;
    this.serverConfig = serverConfig;
    this.client = null;
    this.transport = null;
    this.tools = [];
  }

  async connect() {
    this.transport = this._createTransport();

    this.client = new Client(
      { name: 'ai-transform', version: '1.0.0' },
      { capabilities: {} },
    );

    await this.client.connect(this.transport);
  }

  _createTransport() {
    const cfg = this.serverConfig;

    if (cfg.type === 'streamable-http') {
      const url = new URL(cfg.url);
      return new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers: cfg.headers || {},
        },
      });
    }

    return new StdioClientTransport({
      command: cfg.command,
      args: cfg.args || [],
      env: { ...cfg.env },
    });
  }

  async listTools() {
    const res = await this.client.listTools();
    this.tools = res.tools || [];
    return this.tools;
  }

  async callTool(name, args) {
    const res = await this.client.callTool({ name, arguments: args });
    if (res.content) {
      return res.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
    }
    return JSON.stringify(res);
  }

  async disconnect() {
    await this.client?.close();
    this.client = null;
    this.transport = null;
  }
}

module.exports = McpClient;
