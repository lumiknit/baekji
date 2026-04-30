import { createSignal } from 'solid-js';

const [logs, setLogs] = createSignal<string[]>([]);

export { logs };

export function logError(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${context}] ${message}${stack ? '\n' + stack : ''}`;

  console.error(logEntry);
  setLogs((prev) => [logEntry, ...prev].slice(0, 100)); // Keep last 100 logs
}

export function logInfo(message: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [INFO] ${message}`;
  console.log(logEntry);
  setLogs((prev) => [logEntry, ...prev].slice(0, 100));
}
