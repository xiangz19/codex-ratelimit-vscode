import * as vscode from 'vscode';
import { initializeLogging, log, dispose as disposeLogger } from './services/logger';
import { createStatusBarItem } from './handlers/statusBar';
import { startRefreshTimer, stopRefreshTimer, setWindowFocused, updateStats, cleanup } from './utils/updateStats';
import { RateLimitWebView } from './handlers/webView';

let statusBarItem: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
  try {
    log('Extension activation started');
    extensionContext = context;

    // Initialize logging
    initializeLogging();

    // Create status bar item
    statusBarItem = createStatusBarItem();
    context.subscriptions.push(statusBarItem);

    // Register commands
    const refreshCommand = vscode.commands.registerCommand('codex-ratelimit.refreshStats', async () => {
      log('Manual refresh triggered', true); // Force log as error to ensure it shows
      await updateStats();
    });

    const showDetailsCommand = vscode.commands.registerCommand('codex-ratelimit.showDetails', () => {
      log('Show details command triggered');
      RateLimitWebView.createOrShow(context.extensionUri);
    });

    const openSettingsCommand = vscode.commands.registerCommand('codex-ratelimit.openSettings', async () => {
      log('Open settings command triggered');
      await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:xiangz19.codex-ratelimit');
    });

    // Add window focus event listeners
    const focusListener = vscode.window.onDidChangeWindowState(e => {
      setWindowFocused(e.focused);
    });

    // Add configuration change listener
    const configListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('codexRatelimit')) {
        log('Configuration changed, restarting timer with new interval...');
        if (e.affectsConfiguration('codexRatelimit.refreshInterval')) {
          // Restart timer with new interval
          startRefreshTimer();
        } else {
          // Just update stats for other settings
          await updateStats();
        }
      }
    });

    // Add to subscriptions
    context.subscriptions.push(
      refreshCommand,
      showDetailsCommand,
      openSettingsCommand,
      focusListener,
      configListener
    );

    // Start the refresh timer and do initial update
    startRefreshTimer();

    log('Extension activation completed successfully');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    log(`Failed to activate extension: ${errorMessage}`, true);
    vscode.window.showErrorMessage(`Codex Rate Limit extension failed to activate: ${errorMessage}`);
    throw error;
  }
}

export function deactivate() {
  try {
    log('Extension deactivation started');

    // Clean up timers
    cleanup();

    // Dispose logger
    disposeLogger();

    log('Extension deactivation completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    log(`Failed to deactivate extension cleanly: ${errorMessage}`, true);
    throw error;
  }
}