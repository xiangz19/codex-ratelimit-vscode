import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initializeLogging(): void {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Codex Rate Limit');
  }
}

export function log(message: string, isError: boolean = false): void {
  const config = vscode.workspace.getConfiguration('codexRatelimit');
  const enableLogging = config.get<boolean>('enableLogging', false);

  // Always log errors and important messages, only filter debug messages
  if (!enableLogging && !isError && !message.includes('Manual refresh') && !message.includes('Extension activation')) {
    return;
  }

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  if (outputChannel) {
    outputChannel.appendLine(logMessage);
    if (isError) {
      outputChannel.show(true);
    }
  }

  if (isError) {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }
}

export function dispose(): void {
  if (outputChannel) {
    outputChannel.dispose();
    outputChannel = undefined;
  }
}