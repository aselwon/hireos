const sensitiveKeys = /(?:name|email|phone|address|cv|resume|token|password|secret)/i;
const phone = /(?<!\w)(?:\+?\d[\d ()-]{7,}\d)(?!\w)/g;

function redactString(value) {
  return value
    .split(/(\s+)/)
    .map((part) => (part.includes('@') && part.includes('.') ? '[REDACTED]' : part))
    .join('')
    .replace(phone, '[REDACTED]');
}

function redact(value, key = '') {
  if (sensitiveKeys.test(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redact(item, name)])
    );
  }
  return value;
}

export function createLogger(write = (entry) => process.stdout.write(`${entry}\n`)) {
  return {
    info(event, details = {}) {
      write(JSON.stringify(redact({ level: 'info', event, details })));
    },
    error(event, details = {}) {
      write(JSON.stringify(redact({ level: 'error', event, details })));
    },
  };
}
