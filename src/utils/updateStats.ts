import * as vscode from 'vscode';
import { getRateLimitData } from '../services/ratelimitParser';
import { updateStatusBar, showErrorState } from '../handlers/statusBar';
import { log } from '../services/logger';

function getRefreshIntervalMs(): number {
  const config = vscode.workspace.getConfiguration('codexRatelimit');
  const intervalSeconds = Math.max(config.get('refreshInterval', 10), 5); // Minimum 5 seconds
  return intervalSeconds * 1000;
}

let refreshTimer: NodeJS.Timeout | undefined;
let isWindowFocused = true;

export function setWindowFocused(focused: boolean): void {
  isWindowFocused = focused;
  log(`Window focus changed: ${focused ? 'focused' : 'unfocused'}`);

  if (focused) {
    // Resume updates when window gains focus
    startRefreshTimer();
  } else {
    // Pause updates when window loses focus to save resources
    stopRefreshTimer();
  }
}

export function startRefreshTimer(): void {
  // Clear any existing timer
  stopRefreshTimer();

  if (!isWindowFocused) {
    log('Skipping refresh timer start - window not focused');
    return;
  }

  const intervalMs = getRefreshIntervalMs();
  log(`Starting refresh timer with ${intervalMs / 1000}-second interval`);

  // Do initial update immediately
  updateStats();

  // Set up recurring updates
  refreshTimer = setInterval(() => {
    if (isWindowFocused) {
      updateStats();
    }
  }, intervalMs);
}

export function stopRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
    log('Refresh timer stopped');
  }
}

export async function updateStats(): Promise<void> {
  try {
    log('Starting stats update...');

    const result = await getRateLimitData();

    if (!result.found) {
      const errorMessage = result.error || 'Unknown error occurred';
      log(`No rate limit data found: ${errorMessage}`, true);
      showErrorState(errorMessage);
      return;
    }

    if (!result.data) {
      log('Rate limit data is undefined', true);
      showErrorState('Rate limit data is undefined');
      return;
    }

    // Update the status bar with the new data
    updateStatusBar(result.data);
    log('Stats update completed successfully');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Error during stats update: ${errorMessage}`, true);
    showErrorState(`Update failed: ${errorMessage}`);
  }
}

// Clean up function for extension deactivation
export function cleanup(): void {
  log('Cleaning up stats update timer');
  stopRefreshTimer();
}