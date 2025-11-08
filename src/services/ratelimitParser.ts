import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { glob } from 'glob';
import { EventRecord, RateLimit, RateLimitData, ParseResult, TokenCountPayload, TokenUsage } from '../interfaces/types';
import { log } from './logger';
import * as vscode from 'vscode';

function getSessionBasePath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath.replace('~', os.homedir()));
  }
  return path.join(os.homedir(), '.codex', 'sessions');
}

function calculateResetTime(recordTimestamp: Date, rateLimit: RateLimit): { resetTime: Date; isOutdated: boolean; secondsUntilReset: number } {
  const currentTime = new Date();
  let resetTime: Date | null = null;

  if (typeof rateLimit.resets_at === 'number' && !Number.isNaN(rateLimit.resets_at)) {
    resetTime = new Date(rateLimit.resets_at * 1000);
  } else if (typeof rateLimit.resets_in_seconds === 'number' && !Number.isNaN(rateLimit.resets_in_seconds)) {
    resetTime = new Date(recordTimestamp.getTime() + rateLimit.resets_in_seconds * 1000);
  }

  if (!resetTime || Number.isNaN(resetTime.getTime())) {
    return {
      resetTime: recordTimestamp,
      isOutdated: true,
      secondsUntilReset: 0
    };
  }

  const secondsUntilReset = Math.max(0, Math.floor((resetTime.getTime() - currentTime.getTime()) / 1000));
  const isOutdated = resetTime < currentTime;

  return { resetTime, isOutdated, secondsUntilReset };
}

async function parseSessionFile(filePath: string): Promise<EventRecord | null> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    let latestRecord: EventRecord | null = null;
    let latestTimestamp: Date | null = null;

    for (const line of lines) {
      try {
        const record = JSON.parse(line);

        // Check if this is a token_count event
        if (record.type === 'event_msg' &&
            record.payload?.type === 'token_count') {

          const timestamp = new Date(record.timestamp.replace('Z', '+00:00'));

          if (!latestTimestamp || timestamp > latestTimestamp) {
            latestTimestamp = timestamp;
            latestRecord = record as EventRecord;
          }
        }
      } catch (jsonError) {
        // Skip malformed lines
        continue;
      }
    }

    return latestRecord;
  } catch (error) {
    log(`Error reading session file ${filePath}: ${error}`, true);
    return null;
  }
}

async function getSessionFilesWithMtime(sessionPath: string): Promise<{ file: string; mtimeMs: number }[]> {
  const sessionFiles: { file: string; mtimeMs: number }[] = [];
  const currentDate = new Date();

  for (let daysBack = 0; daysBack < 7; daysBack++) {
    const searchDate = new Date(currentDate);
    searchDate.setDate(currentDate.getDate() - daysBack);

    const year = searchDate.getFullYear();
    const month = String(searchDate.getMonth() + 1).padStart(2, '0');
    const day = String(searchDate.getDate()).padStart(2, '0');

    const datePath = path.join(sessionPath, String(year), month, day);

    if (!fs.existsSync(datePath)) {
      continue;
    }

    try {
      const pattern = path.join(datePath, 'rollout-*.jsonl').replace(/\\/g, '/');
      const files = await glob(pattern, { nodir: true });

      for (const file of files) {
        try {
          const stats = await fs.promises.stat(file);
          sessionFiles.push({ file, mtimeMs: stats.mtimeMs });
        } catch (error) {
          log(`Error getting mtime for session file ${file}: ${error}`, false);
        }
      }
    } catch (error) {
      log(`Error collecting session files from ${datePath}: ${error}`, false);
    }
  }

  sessionFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return sessionFiles;
}

async function findLatestTokenCountRecord(basePath?: string): Promise<{ file: string; record: EventRecord } | null> {
  const sessionPath = getSessionBasePath(basePath);

  if (!fs.existsSync(sessionPath)) {
    log(`Session path does not exist: ${sessionPath}`, true);
    return null;
  }

  const nowMs = Date.now();
  const oneHourAgoMs = nowMs - 60 * 60 * 1000;
  const attemptedFiles = new Set<string>();

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = String(today.getMonth() + 1).padStart(2, '0');
  const todayDay = String(today.getDate()).padStart(2, '0');
  const todayPath = path.join(sessionPath, String(todayYear), todayMonth, todayDay);

  if (fs.existsSync(todayPath)) {
    try {
      const pattern = path.join(todayPath, 'rollout-*.jsonl').replace(/\\/g, '/');
      const files = await glob(pattern, { nodir: true });

      const recentFiles: { file: string; mtimeMs: number }[] = [];

      for (const file of files) {
        try {
          const stats = await fs.promises.stat(file);
          if (stats.mtimeMs >= oneHourAgoMs) {
            recentFiles.push({ file, mtimeMs: stats.mtimeMs });
          }
        } catch (error) {
          log(`Error reading stats for session file ${file}: ${error}`, false);
        }
      }

      recentFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

      for (const { file } of recentFiles) {
        attemptedFiles.add(file);
        const record = await parseSessionFile(file);
        if (record) {
          return { file, record };
        }
      }
    } catch (error) {
      log(`Error searching today's session files in ${todayPath}: ${error}`, false);
    }
  }

  const sessionFiles = await getSessionFilesWithMtime(sessionPath);

  for (const { file } of sessionFiles) {
    if (attemptedFiles.has(file)) {
      continue;
    }

    const record = await parseSessionFile(file);
    if (record) {
      return { file, record };
    }
  }

  return null;
}

export async function getRateLimitData(customPath?: string): Promise<ParseResult> {
  try {
    const config = vscode.workspace.getConfiguration('codexRatelimit');
    const sessionPath = customPath || config.get<string>('sessionPath', '');

    log(`Searching for latest token_count event in ${sessionPath || 'default path'}...`);

    const result = await findLatestTokenCountRecord(sessionPath || undefined);
    if (!result) {
      return {
        found: false,
        error: 'No token_count events found in session files'
      };
    }

    const { file, record } = result;
    const payload = record.payload;
    const rateLimits = payload.rate_limits || {};
    const info = payload.info;

    const recordTimestamp = new Date(record.timestamp.replace('Z', '+00:00'));
    const currentTime = new Date();

    if (!info) {
      log('Token count payload missing usage info; defaulting to zero values.', false);
    } else if (!info.total_token_usage || !info.last_token_usage) {
      log('Token count payload has incomplete usage info; defaulting missing fields to zero.', false);
    }

    const totalUsage = info?.total_token_usage ?? createEmptyTokenUsage();
    const lastUsage = info?.last_token_usage ?? createEmptyTokenUsage();

    const data: RateLimitData = {
      file_path: file,
      record_timestamp: recordTimestamp,
      current_time: currentTime,
      total_usage: totalUsage,
      last_usage: lastUsage
    };

    // Process primary (5h) rate limits
    if (rateLimits.primary) {
      const primary = rateLimits.primary;
      const { resetTime, isOutdated, secondsUntilReset } = calculateResetTime(recordTimestamp, primary);
      const rawWindowMinutes = primary.window_minutes;
      const windowMinutes = typeof rawWindowMinutes === 'number' && rawWindowMinutes > 0 ? rawWindowMinutes : 0;
      const windowSeconds = windowMinutes * 60;

      let timePercent: number;
      if (windowSeconds <= 0) {
        timePercent = 0;
      } else if (isOutdated) {
        timePercent = 100.0;
      } else {
        const elapsedSeconds = windowSeconds - secondsUntilReset;
        const boundedElapsedSeconds = Math.max(0, Math.min(windowSeconds, elapsedSeconds));
        timePercent = (boundedElapsedSeconds / windowSeconds) * 100;
      }

      data.primary = {
        used_percent: primary.used_percent,
        time_percent: Math.max(0, Math.min(100, timePercent)),
        reset_time: resetTime,
        outdated: isOutdated,
        window_minutes: windowMinutes
      };
    }

    // Process secondary (weekly) rate limits
    if (rateLimits.secondary) {
      const secondary = rateLimits.secondary;
      const { resetTime, isOutdated, secondsUntilReset } = calculateResetTime(recordTimestamp, secondary);
      const rawWindowMinutes = secondary.window_minutes;
      const windowMinutes = typeof rawWindowMinutes === 'number' && rawWindowMinutes > 0 ? rawWindowMinutes : 0;
      const windowSeconds = windowMinutes * 60;

      let timePercent: number;
      if (windowSeconds <= 0) {
        timePercent = 0;
      } else if (isOutdated) {
        timePercent = 100.0;
      } else {
        const elapsedSeconds = windowSeconds - secondsUntilReset;
        const boundedElapsedSeconds = Math.max(0, Math.min(windowSeconds, elapsedSeconds));
        timePercent = (boundedElapsedSeconds / windowSeconds) * 100;
      }

      data.secondary = {
        used_percent: secondary.used_percent,
        time_percent: Math.max(0, Math.min(100, timePercent)),
        reset_time: resetTime,
        outdated: isOutdated,
        window_minutes: windowMinutes
      };
    }

    log(`Found latest token_count event in: ${file}`);
    return {
      found: true,
      data
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Error getting rate limit data: ${errorMessage}`, true);
    return {
      found: false,
      error: errorMessage
    };
  }
}

function createEmptyTokenUsage(): TokenUsage {
  return {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0
  };
}

function formatTokenNumber(num: number): string {
  const numInK = Math.round(num / 1000);
  return numInK.toLocaleString('en-US') + ' K';
}

export function formatTokenUsage(usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_output_tokens: number; total_tokens: number }): string {
  return `input ${formatTokenNumber(usage.input_tokens)}, cached ${formatTokenNumber(usage.cached_input_tokens)}, output ${formatTokenNumber(usage.output_tokens)}, reasoning ${formatTokenNumber(usage.reasoning_output_tokens)}`;
}
