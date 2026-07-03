function sanitize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack?.split('\n').slice(0, 4).join('\n'),
    };
  }

  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/key|token|secret|password|authorization/i.test(key)) return [key, '[redacted]'];
      return [key, entry];
    }),
  );
}

export function logInfo(traceId, step, details = {}) {
  console.log(`[videotoprompt:${traceId}] ${step}`, sanitize(details));
}

export function logWarn(traceId, step, details = {}) {
  console.warn(`[videotoprompt:${traceId}] ${step}`, sanitize(details));
}

export function logError(traceId, step, details = {}) {
  console.error(`[videotoprompt:${traceId}] ${step}`, sanitize(details));
}

export function elapsedMs(startedAt) {
  return Date.now() - startedAt;
}
