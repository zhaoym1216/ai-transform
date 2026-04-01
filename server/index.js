const express = require('express');
const cors = require('cors');
const config = require('./config');
const toolRegistry = require('./tools/registry');
const scheduleRunner = require('./schedule-runner');
const scheduleState = require('./schedule-state');
const chatRouter = require('./routes/chat');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/chat', chatRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: config.ai.model });
});

(async () => {
  console.log('Initializing tool registry...');
  await toolRegistry.initialize();
  scheduleState.initFromDisk();

  const server = app.listen(config.server.port, () => {
    console.log(`Server running on http://localhost:${config.server.port}`);
    console.log(`AI Base URL: ${config.ai.baseUrl}`);
    console.log(`AI Model:    ${config.ai.model}`);
    scheduleRunner.start();
    scheduleRunner.tick().catch((e) => console.error('Initial schedule tick:', e));
  });

  const shutdown = async () => {
    try {
      scheduleRunner.stop();
      await toolRegistry.shutdown();
    } catch (err) {
      console.error('Shutdown error:', err);
    }
    server.close(() => process.exit(0));
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
})();
