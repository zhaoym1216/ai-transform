const { Router } = require('express');
const ReactAgent = require('../react-agent');

const router = Router();

router.post('/completions', async (req, res) => {
  const { messages = [] } = req.body;

  if (!messages.length) {
    return res.status(400).json({ error: 'messages is required' });
  }

  const upstreamController = new AbortController();

  res.on('close', () => {
    if (!res.writableFinished) {
      upstreamController.abort();
    }
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const agent = new ReactAgent({
    writer: (event) => {
      if (!res.writableFinished) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (res.flush) res.flush();
      }
    },
    signal: upstreamController.signal,
  });

  try {
    await agent.run(messages);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('ReAct agent error:', err);
    agent.emit({ type: 'error', message: err.message });
  }

  if (!res.writableFinished) res.end();
});

module.exports = router;
