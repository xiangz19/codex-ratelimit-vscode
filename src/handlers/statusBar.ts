import * as vscode from 'vscode';
import { RateLimitData } from '../interfaces/types';
import { log } from '../services/logger';

let statusBarItem: vscode.StatusBarItem;

export function createStatusBarItem(): vscode.StatusBarItem {
  log('Creating status bar item...');
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'codex-ratelimit.showDetails';
  return statusBarItem;
}

export function getStatusBarColor(percentage: number): vscode.ThemeColor {
  const config = vscode.workspace.getConfiguration('codexRatelimit');
  const colorsEnabled = config.get<boolean>('enableStatusBarColors', true);
  const warningThreshold = config.get<number>('warningThreshold', 70);

  if (!colorsEnabled) {
    return new vscode.ThemeColor('statusBarItem.foreground');
  }

  if (percentage >= 95) {
    return new vscode.ThemeColor('charts.red');
  } else if (percentage >= 90) {
    return new vscode.ThemeColor('errorForeground');
  } else if (percentage >= warningThreshold) {
    return new vscode.ThemeColor('charts.yellow');
  } else if (percentage >= 50) {
    return new vscode.ThemeColor('charts.green');
  } else {
    return new vscode.ThemeColor('statusBarItem.foreground');
  }
}

export function getUsageEmoji(percentage: number): string {
  if (percentage >= 90) {
    return '🔴';
  }
  if (percentage >= 75) {
    return '🟡';
  }
  if (percentage >= 50) {
    return '🟢';
  }
  return '✅';
}

export function formatRelativeTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function createMarkdownTooltip(data: RateLimitData): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.isTrusted = true;
  tooltip.supportHtml = true;
  tooltip.supportThemeIcons = true;

  // Header
  tooltip.appendMarkdown('<div align="center">\n\n');
  tooltip.appendMarkdown('## ⚡ Codex Rate Limit Monitor\n\n');
  tooltip.appendMarkdown('</div>\n\n');

  // 5-hour session info
  if (data.primary) {
    const primary = data.primary;
    const resetTimeStr = primary.reset_time.toLocaleString();
    const outdatedStr = primary.outdated ? ' [OUTDATED]' : '';
    const usageEmoji = getUsageEmoji(primary.used_percent);

    tooltip.appendMarkdown('<div align="center">\n\n');
    tooltip.appendMarkdown('### 🚀 5-Hour Session\n\n');
    tooltip.appendMarkdown('</div>\n\n');

    tooltip.appendMarkdown(`**Usage:** ${primary.used_percent.toFixed(1)}% ${usageEmoji}\n\n`);
    tooltip.appendMarkdown(`**Time Progress:** ${primary.time_percent.toFixed(1)}%\n\n`);
    tooltip.appendMarkdown(`**Reset:** ${resetTimeStr}${outdatedStr}\n\n`);
  }

  // Weekly info
  if (data.secondary) {
    const secondary = data.secondary;
    const resetTimeStr = secondary.reset_time.toLocaleString();
    const outdatedStr = secondary.outdated ? ' [OUTDATED]' : '';
    const usageEmoji = getUsageEmoji(secondary.used_percent);

    tooltip.appendMarkdown('<div align="center">\n\n');
    tooltip.appendMarkdown('### 📅 Weekly Limit\n\n');
    tooltip.appendMarkdown('</div>\n\n');

    tooltip.appendMarkdown(`**Usage:** ${secondary.used_percent.toFixed(1)}% ${usageEmoji}\n\n`);
    tooltip.appendMarkdown(`**Time Progress:** ${secondary.time_percent.toFixed(1)}%\n\n`);
    tooltip.appendMarkdown(`**Reset:** ${resetTimeStr}${outdatedStr}\n\n`);
  }

  // Token usage summary
  tooltip.appendMarkdown('---\n\n');
  tooltip.appendMarkdown('<div align="center">\n\n');
  tooltip.appendMarkdown('### 📊 Token Usage\n\n');
  tooltip.appendMarkdown('</div>\n\n');

  const total = data.total_usage;
  const last = data.last_usage;

  tooltip.appendMarkdown(`**Total:** input ${total.input_tokens}, cached ${total.cached_input_tokens}, output ${total.output_tokens}, reasoning ${total.reasoning_output_tokens}\n\n`);
  tooltip.appendMarkdown(`**Last:** input ${last.input_tokens}, cached ${last.cached_input_tokens}, output ${last.output_tokens}, reasoning ${last.reasoning_output_tokens}\n\n`);

  // Action buttons
  tooltip.appendMarkdown('---\n\n');
  tooltip.appendMarkdown('<div align="center">\n\n');

  tooltip.appendMarkdown('📊 [Show Details](command:codex-ratelimit.showDetails) • ');
  tooltip.appendMarkdown('⚙️ [Settings](command:codex-ratelimit.openSettings) • ');
  tooltip.appendMarkdown(`🕒 ${formatRelativeTime(data.current_time)}\n\n`);

  tooltip.appendMarkdown('</div>');

  return tooltip;
}

export function updateStatusBar(data: RateLimitData): void {
  if (!statusBarItem) {
    log('Status bar item not initialized', true);
    return;
  }

  try {
    // Calculate the highest usage percentage for color coding
    let maxUsagePercent = 0;
    let primaryUsage = 0;
    let weeklyUsage = 0;

    if (data.primary) {
      primaryUsage = data.primary.used_percent;
      maxUsagePercent = Math.max(maxUsagePercent, primaryUsage);
    }

    if (data.secondary) {
      weeklyUsage = data.secondary.used_percent;
      maxUsagePercent = Math.max(maxUsagePercent, weeklyUsage);
    }

    // Format status bar text
    const primaryText = data.primary ? `${Math.round(primaryUsage)}%` : 'N/A';
    const weeklyText = data.secondary ? `${Math.round(weeklyUsage)}%` : 'N/A';

    statusBarItem.text = `⚡ 5H: ${primaryText} | Weekly: ${weeklyText}`;
    statusBarItem.color = getStatusBarColor(maxUsagePercent);
    statusBarItem.tooltip = createMarkdownTooltip(data);
    statusBarItem.show();

    log(`Status bar updated - 5H: ${primaryText}, Weekly: ${weeklyText}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Error updating status bar: ${errorMessage}`, true);

    statusBarItem.text = '⚡ Codex: Error';
    statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.tooltip = new vscode.MarkdownString('⚠️ Error updating rate limit data');
    statusBarItem.show();
  }
}

export function showErrorState(message: string): void {
  if (!statusBarItem) {
    return;
  }

  statusBarItem.text = '⚡ Codex: Error';
  statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorBackground');
  statusBarItem.tooltip = new vscode.MarkdownString(`⚠️ ${message}`);
  statusBarItem.show();

  log(`Status bar showing error: ${message}`);
}