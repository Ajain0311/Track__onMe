// utils/logger.js — structured leveled logger (no external deps)

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const fmt = (level, msg, meta) => {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level.toUpperCase().padEnd(5)} ${msg}`;
  return meta && Object.keys(meta).length ? `${base} ${JSON.stringify(meta)}` : base;
};

const log = (level) => (msg, meta) => {
  if (LEVELS[level] > current) return;
  const out = fmt(level, msg, meta);
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(out);
};

module.exports = {
  error: log('error'),
  warn:  log('warn'),
  info:  log('info'),
  debug: log('debug'),
};
