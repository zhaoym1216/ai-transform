const McpClient = require('./mcp-client');
const toolsConfig = require('./tools.config');

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.mcpClients = new Map();
    this.ready = false;
  }

  async initialize() {
    if (this.ready) return;

    for (const t of toolsConfig.tools) {
      this.tools.set(t.name, {
        type: 'builtin',
        definition: {
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        },
        handler: t.handler,
      });
    }

    for (const [name, cfg] of Object.entries(toolsConfig.mcpServers || {})) {
      try {
        const client = new McpClient(name, cfg);
        await client.connect();
        const mcpTools = await client.listTools();
        this.mcpClients.set(name, client);

        for (const mt of mcpTools) {
          const fullName = `${name}__${mt.name}`;
          this.tools.set(fullName, {
            type: 'mcp',
            mcpServer: name,
            mcpToolName: mt.name,
            definition: {
              type: 'function',
              function: {
                name: fullName,
                description: `[MCP:${name}] ${mt.description || ''}`,
                parameters: mt.inputSchema || { type: 'object', properties: {} },
              },
            },
          });
        }
        console.log(`  MCP [${name}]: ${mcpTools.length} tools loaded`);
      } catch (err) {
        console.error(`  MCP [${name}] connect failed: ${err.message}`);
      }
    }

    this.ready = true;
    console.log(`  Tool registry: ${this.tools.size} tools total`);
  }

  getToolDefinitions() {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async executeTool(name, args) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    if (tool.type === 'builtin') {
      return await tool.handler(args);
    }

    if (tool.type === 'mcp') {
      const client = this.mcpClients.get(tool.mcpServer);
      if (!client) throw new Error(`MCP [${tool.mcpServer}] not connected`);
      return await client.callTool(tool.mcpToolName, args);
    }

    throw new Error(`Unknown tool type: ${tool.type}`);
  }

  async shutdown() {
    for (const [name, client] of this.mcpClients) {
      await client.disconnect();
      console.log(`MCP [${name}] disconnected`);
    }
  }
}

module.exports = new ToolRegistry();
