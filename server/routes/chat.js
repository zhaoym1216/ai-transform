const { Router } = require('express');
const ReactAgent = require('../agent/react-agent');
const scheduleState = require('../schedule/state');
const { resolveConfirmation } = require('../tools/confirmation');

const router = Router();

router.get('/schedule-restore-status', (_req, res) => {
  res.json(scheduleState.getScheduleRestoreStatus());
});

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

  const extraSystemMessages = [];
  if (scheduleState.isPendingScheduleRestore()) {
    if (scheduleState.shouldInjectFullRestoreDetail()) {
      extraSystemMessages.push({
        role: 'system',
        content: scheduleState.getRestorePromptContent(),
      });
      scheduleState.markFullRestoreDetailInjected();
    } else {
      extraSystemMessages.push({
        role: 'system',
        content: scheduleState.getRestorePromptShortContent(),
      });
    }
  }

  try {
    await agent.run(messages, { extraSystemMessages });
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('ReAct agent error:', err);
    agent.emit({ type: 'error', message: err.message });
  }

  if (!res.writableFinished) res.end();
});

router.post('/confirm', (req, res) => {
  const { confirmId, approved } = req.body;

  if (!confirmId || typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'confirmId (string) and approved (boolean) are required' });
  }

  const found = resolveConfirmation(confirmId, approved);

  if (!found) {
    return res.status(404).json({ error: '确认请求不存在或已过期' });
  }

  res.json({ ok: true });
});

module.exports = router;
