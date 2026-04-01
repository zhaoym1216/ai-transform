const crypto = require('crypto');

const CONFIRM_TIMEOUT = 120_000; // 2 min

const pending = new Map();

function createConfirmation() {
  const id = crypto.randomUUID();
  let resolve;
  const promise = new Promise((res, rej) => {
    resolve = res;
    const timer = setTimeout(() => {
      pending.delete(id);
      rej(new Error('确认超时（2分钟），操作已取消'));
    }, CONFIRM_TIMEOUT);
    pending.set(id, { resolve: (approved) => {
      clearTimeout(timer);
      pending.delete(id);
      res(approved);
    }});
  });
  return { id, promise };
}

function resolveConfirmation(id, approved) {
  const entry = pending.get(id);
  if (!entry) return false;
  entry.resolve(approved);
  return true;
}

module.exports = { createConfirmation, resolveConfirmation };
