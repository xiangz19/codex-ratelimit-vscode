import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { glob } from 'glob';
import { EventRecord, RateLimitData, ParseResult, TokenCountPayload } from '../interfaces/types';
import { log } from './logger';
import * as vscode from 'vscode';

function getSessionBasePath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath.replace('~', os.homedir()));
  }
  return path.join(os.homedir(), '.codex', 'sessions');
}

function calculateResetTime(recordTimestamp: Date, resetInSeconds: number): { resetTime: Date; isOutdated: boolean } {
  const resetTime = new Date(recordTimestamp.getTime() + resetInSeconds * 1000);
  const currentTime = new Date();
  const isOutdated = resetTime < currentTime;

  return { resetTime, isOutdated };
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

async function findLatestTokenCountRecord(basePath?: string): Promise<{ file: string; record: EventRecord } | null> {
  const sessionPath = getSessionBasePath(basePath);

  if (!fs.existsSync(sessionPath)) {
    log(`Session path does not exist: ${sessionPath}`, true);
    return null;
  }

  let latestRecord: EventRecord | null = null;
  let latestTimestamp: Date | null = null;
  let latestFile: string | null = null;

  // Search backwards for up to 7 days
  const currentDate = new Date();

  for (let daysBack = 0; daysBack < 7; daysBack++) {
    const searchDate = new Date(currentDate);
    searchDate.setDate(currentDate.getDate() - daysBack);

    const year = searchDate.getFullYear();
    const month = String(searchDate.getMonth() + 1).padStart(2, '0');
    const day = String(searchDate.getDate()).padStart(2, '0');

    const datePath = path.join(sessionPath, String(year), month, day);

    if (fs.existsSync(datePath)) {
      try {
        const pattern = path.join(datePath, 'rollout-*.jsonl');
        const normalizedPattern = pattern.replace(/\\/g, '/');
        const files = await glob(normalizedPattern, { nodir: true });

        for (const file of files) {
          const record = await parseSessionFile(file);
          if (record) {
            const timestamp = new Date(record.timestamp.replace('Z', '+00:00'));

            if (!latestTimestamp || timestamp > latestTimestamp) {
              latestTimestamp = timestamp;
              latestRecord = record;
              latestFile = file;
            }
          }
        }

        // If we found records on this day, return the latest one
        if (latestRecord && latestFile) {
          return { file: latestFile, record: latestRecord };
        }
      } catch (error) {
        log(`Error searching date path ${datePath}: ${error}`, false);
        continue;
      }
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

    const recordTimestamp = new Date(record.timestamp.replace('Z', '+00:00'));
    const currentTime = new Date();

    const data: RateLimitData = {
      file_path: file,
      record_timestamp: recordTimestamp,
      current_time: currentTime,
      total_usage: payload.info.total_token_usage,
      last_usage: payload.info.last_token_usage
    };

    // Process primary (5h) rate limits
    if (rateLimits.primary) {
      const primary = rateLimits.primary;
      const { resetTime, isOutdated } = calculateResetTime(recordTimestamp, primary.resets_in_seconds);
      const windowSeconds = primary.window_minutes * 60;

      let timePercent: number;
      if (isOutdated) {
        timePercent = 100.0;
      } else {
        const elapsedSeconds = windowSeconds - primary.resets_in_seconds;
        timePercent = windowSeconds > 0 ? (elapsedSeconds / windowSeconds) * 100 : 0;
      }

      data.primary = {
        used_percent: primary.used_percent,
        time_percent: Math.max(0, Math.min(100, timePercent)),
        reset_time: resetTime,
        outdated: isOutdated,
        window_minutes: primary.window_minutes
      };
    }

    // Process secondary (weekly) rate limits
    if (rateLimits.secondary) {
      const secondary = rateLimits.secondary;
      const { resetTime, isOutdated } = calculateResetTime(recordTimestamp, secondary.resets_in_seconds);
      const windowSeconds = secondary.window_minutes * 60;

      let timePercent: number;
      if (isOutdated) {
        timePercent = 100.0;
      } else {
        const elapsedSeconds = windowSeconds - secondary.resets_in_seconds;
        timePercent = windowSeconds > 0 ? (elapsedSeconds / windowSeconds) * 100 : 0;
      }

      data.secondary = {
        used_percent: secondary.used_percent,
        time_percent: Math.max(0, Math.min(100, timePercent)),
        reset_time: resetTime,
        outdated: isOutdated,
        window_minutes: secondary.window_minutes
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

export function formatTokenUsage(usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_output_tokens: number; total_tokens: number }): string {
  return `input ${usage.input_tokens}, cached ${usage.cached_input_tokens}, output ${usage.output_tokens}, reasoning ${usage.reasoning_output_tokens}, subtotal ${usage.total_tokens}`;
}
