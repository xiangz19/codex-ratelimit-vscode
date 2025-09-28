import * as vscode from 'vscode';
import { RateLimitData } from '../interfaces/types';
import { getRateLimitData, formatTokenUsage } from '../services/ratelimitParser';
import { log } from '../services/logger';

export class RateLimitWebView {
  public static currentPanel: RateLimitWebView | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (RateLimitWebView.currentPanel) {
      RateLimitWebView.currentPanel._panel.reveal(column);
      RateLimitWebView.currentPanel._update();
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'codexRateLimit',
      'Codex Rate Limit Details',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    RateLimitWebView.currentPanel = new RateLimitWebView(panel, extensionUri);
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    RateLimitWebView.currentPanel = new RateLimitWebView(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        log(`WebView received message: ${JSON.stringify(message)}`, true); // Force log
        switch (message.command) {
          case 'refresh':
            log('WebView refresh triggered', true); // Force log
            await this._update();
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    RateLimitWebView.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private async _update() {
    const webview = this._panel.webview;

    try {
      const result = await getRateLimitData();

      if (!result.found) {
        this._panel.webview.html = this._getErrorHtml(result.error || 'No rate limit data found');
        return;
      }

      if (!result.data) {
        this._panel.webview.html = this._getErrorHtml('Rate limit data is undefined');
        return;
      }

      this._panel.webview.html = this._getHtml(webview, result.data);
      log('WebView updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Error updating WebView: ${errorMessage}`, true);
      this._panel.webview.html = this._getErrorHtml(errorMessage);
    }
  }

  private _getHtml(webview: vscode.Webview, data: RateLimitData): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Codex Rate Limit Details</title>
      <link href="${styleUri}" rel="stylesheet">
    </head>
    <body>
      <div class="container">
        <div class="header">
          CODEX RATELIMIT - LIVE USAGE MONITOR
        </div>

        ${this._renderProgressSection(data)}

        <div class="token-usage">
          <h3>📊 Token Usage Summary</h3>
          <div class="token-line"><strong>Total:</strong> ${formatTokenUsage(data.total_usage)}</div>
          <div class="token-line"><strong>Last:</strong> ${formatTokenUsage(data.last_usage)}</div>
        </div>

        <div class="refresh-info">
          Last updated: ${data.current_time.toLocaleString()}<br>
          <button onclick="refresh()" style="margin-top: 10px; padding: 5px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer;">
            🔄 Refresh
          </button>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();

        function refresh() {
          vscode.postMessage({ command: 'refresh' });
        }
      </script>
    </body>
    </html>`;
  }

  private _renderProgressSection(data: RateLimitData): string {
    let html = '';

    // 5-Hour Session
    if (data.primary) {
      const primary = data.primary;
      const resetTimeStr = primary.reset_time.toLocaleString();
      const outdatedStr = primary.outdated ? ' [OUTDATED]' : '';

      html += `
        <div class="progress-section">
          <div class="progress-header">🚀 5-Hour Session</div>
          <div class="progress-bar-container">
            <div class="progress-bar">
              <div class="progress-label">SESSION TIME</div>
              <div class="progress-track">
                <div class="progress-fill time ${this._getProgressClass(primary.time_percent, primary.outdated)}"
                     style="width: ${primary.time_percent}%"></div>
              </div>
              <div class="progress-percentage">${primary.time_percent.toFixed(1)}%</div>
            </div>
            <div class="progress-details">Reset: ${resetTimeStr}${outdatedStr}</div>

            <div class="progress-bar">
              <div class="progress-label">5H USAGE</div>
              <div class="progress-track">
                <div class="progress-fill usage ${this._getUsageClass(primary.used_percent, primary.outdated)}"
                     style="width: ${primary.used_percent}%"></div>
              </div>
              <div class="progress-percentage">${primary.used_percent.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      `;
    }

    // Weekly Session
    if (data.secondary) {
      const secondary = data.secondary;
      const resetTimeStr = secondary.reset_time.toLocaleString();
      const outdatedStr = secondary.outdated ? ' [OUTDATED]' : '';

      html += `
        <div class="progress-section">
          <div class="progress-header">📅 Weekly Limit</div>
          <div class="progress-bar-container">
            <div class="progress-bar">
              <div class="progress-label">WEEKLY TIME</div>
              <div class="progress-track">
                <div class="progress-fill time ${this._getProgressClass(secondary.time_percent, secondary.outdated)}"
                     style="width: ${secondary.time_percent}%"></div>
              </div>
              <div class="progress-percentage">${secondary.time_percent.toFixed(1)}%</div>
            </div>
            <div class="progress-details">Reset: ${resetTimeStr}${outdatedStr}</div>

            <div class="progress-bar">
              <div class="progress-label">WEEKLY USAGE</div>
              <div class="progress-track">
                <div class="progress-fill usage ${this._getUsageClass(secondary.used_percent, secondary.outdated)}"
                     style="width: ${secondary.used_percent}%"></div>
              </div>
              <div class="progress-percentage">${secondary.used_percent.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      `;
    }

    return html;
  }

  private _getProgressClass(percentage: number, outdated: boolean): string {
    if (outdated) {
      return 'outdated';
    }
    return '';
  }

  private _getUsageClass(percentage: number, outdated: boolean): string {
    if (outdated) {
      return 'outdated';
    }

    if (percentage >= 90) {
      return 'high';
    } else if (percentage >= 70) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private _getErrorHtml(errorMessage: string): string {
    const styleUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Codex Rate Limit Details - Error</title>
      <link href="${styleUri}" rel="stylesheet">
    </head>
    <body>
      <div class="container">
        <div class="error-state">
          <h2>⚠️ Error</h2>
          <p>${errorMessage}</p>
          <button onclick="refresh()" style="margin-top: 10px; padding: 5px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer;">
            🔄 Try Again
          </button>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();

        function refresh() {
          vscode.postMessage({ command: 'refresh' });
        }
      </script>
    </body>
    </html>`;
  }
}