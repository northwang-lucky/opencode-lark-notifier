import { appendFile, mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { CreateLoggerParams, Logger, LogLevel } from "./types";

const MAX_LINE_LENGTH = 4096;

const LEVEL_VALUES: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTimestamp(date: Date): string {
  const Y = String(date.getFullYear());
  const M = pad(date.getMonth() + 1);
  const D = pad(date.getDate());
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function formatDateOnly(date: Date): string {
  const Y = String(date.getFullYear());
  const M = pad(date.getMonth() + 1);
  const D = pad(date.getDate());
  return `${Y}-${M}-${D}`;
}

function buildLine(timestamp: string, level: LogLevel, moduleName: string, msg: string): string {
  let clean = msg.replace(/\n/g, " ");
  if (clean.length > MAX_LINE_LENGTH) {
    clean = clean.slice(0, MAX_LINE_LENGTH);
  }
  return `[${timestamp}] [${level}] [${moduleName}] ${clean}\n`;
}

function resolveLogDir(logDir: string): string {
  if (logDir !== "") return logDir;

  // Empty logDir: compute from XDG_STATE_HOME
  const xdgStateHome = process.env.XDG_STATE_HOME ?? `${process.env.HOME ?? "/tmp"}/.local/state`;
  return path.join(xdgStateHome, "opencode-lark-notifier", "logs");
}

/**
 * Create a file-based logger with level filtering, daily rotation,
 * old file cleanup, and serialised writes.
 */
export function createLogger(params: CreateLoggerParams): Logger {
  const minLevel = LEVEL_VALUES[params.logLevel];
  const { moduleName } = params;
  const { maxRetentionDays } = params;
  const baseDir = path.resolve(resolveLogDir(params.logDir));

  let lastDate: string | null = null;
  let logFilePath = "";
  let writeQueue: Promise<void> = Promise.resolve();

  async function ensureDir(): Promise<void> {
    await mkdir(baseDir, { recursive: true });
  }

  async function cleanOldFiles(now: Date): Promise<void> {
    try {
      const entries = await readdir(baseDir);

      // Cutoff at midnight of today minus maxRetentionDays,
      // so files from "today - maxRetentionDays" are kept.
      const cutoff = new Date(`${formatDateOnly(now)}T00:00:00`);
      cutoff.setDate(cutoff.getDate() - maxRetentionDays);

      for (const entry of entries) {
        if (!entry.endsWith(".log")) continue;

        const dateStr = entry.slice(0, -4); // Remove ".log"
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

        const fileDate = new Date(`${dateStr}T00:00:00`);
        if (fileDate.getTime() < cutoff.getTime()) {
          await unlink(path.join(baseDir, entry));
        }
      }
    } catch {
      // Silent failure — cleanup is best-effort
    }
  }

  function enqueue(level: LogLevel, msg: string): void {
    writeQueue = writeQueue
      .then(async () => {
        const now = new Date();
        await ensureDir();

        const today = formatDateOnly(now);
        if (today !== lastDate) {
          lastDate = today;
          logFilePath = path.join(baseDir, `${today}.log`);
          await cleanOldFiles(now);
        }

        const timestamp = formatTimestamp(now);
        const line = buildLine(timestamp, level, moduleName, msg);
        await appendFile(logFilePath, line);
      })
      .catch(() => {
        // Silent failure — never throw from write queue
      });
  }

  return {
    debug(msg: string): void {
      if (LEVEL_VALUES.DEBUG >= minLevel) enqueue("DEBUG", msg);
    },
    info(msg: string): void {
      if (LEVEL_VALUES.INFO >= minLevel) enqueue("INFO", msg);
    },
    warn(msg: string): void {
      if (LEVEL_VALUES.WARN >= minLevel) enqueue("WARN", msg);
    },
    error(msg: string): void {
      if (LEVEL_VALUES.ERROR >= minLevel) enqueue("ERROR", msg);
    },
  };
}
