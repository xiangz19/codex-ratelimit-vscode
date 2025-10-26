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

export function getStatusBarColor(percentage: number): string | vscode.ThemeColor {
  const config = vscode.workspace.getConfiguration('codexRatelimit');
  const colorsEnabled = config.get<boolean>('color.enable', true);

  if (!colorsEnabled) {
    return new vscode.ThemeColor('statusBarItem.foreground');
  }

  const warningThreshold = config.get<number>('color.warningThreshold', 70);
  const warningColor = config.get<string>('color.warningColor', '#f3d898');
  const criticalThreshold = config.get<number>('color.criticalThreshold', 90);
  const criticalColor = config.get<string>('color.criticalColor', '#eca7a7');

  if (percentage >= criticalThreshold) {
    return criticalColor;
  } else if (percentage >= warningThreshold) {
    return warningColor;
  } else {
    return new vscode.ThemeColor('statusBarItem.foreground');
  }
}

export function formatRelativeTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function createProgressBar(percentage: number, type: 'usage' | 'time', outdated: boolean): string {
  const width = 200; // Total width in pixels
  const height = 16; // Height in pixels
  const filledWidth = Math.round((percentage / 100) * width);

  let fillColor: string;
  const bgColor = '#333';

  if (outdated) {
    fillColor = '#666';
  } else if (type === 'time') {
    fillColor = '#9C27B0'; // Purple for time progress
  } else {
    // Usage color based on threshold
    const config = vscode.workspace.getConfiguration('codexRatelimit');
    const warningThreshold = config.get<number>('color.warningThreshold', 70);
    const warningColor = config.get<string>('color.warningColor', '#f3d898');
    const criticalThreshold = config.get<number>('color.criticalThreshold', 90);
    const criticalColor = config.get<string>('color.criticalColor', '#eca7a7');

    if (percentage >= criticalThreshold) {
      fillColor = criticalColor;
    } else if (percentage >= warningThreshold) {
      fillColor = warningColor;
    } else {
      fillColor = '#4CAF50'; // Green
    }
  }

  // Create SVG progress bar
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${bgColor}" rx="2"/>
    <rect width="${filledWidth}" height="${height}" fill="${fillColor}" rx="2"/>
  </svg>`;

  const encodedSvg = Buffer.from(svg).toString('base64');
  return `<img src="data:image/svg+xml;base64,${encodedSvg}" alt="Progress: ${percentage.toFixed(1)}%" style="vertical-align: middle;"/>`;
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
    const usagePercent = primary.outdated ? 0 : primary.used_percent;
    const timePercent = primary.outdated ? 0 : primary.time_percent;
    const usageText = primary.outdated ? 'N/A' : usagePercent.toFixed(1) + '%';
    const timeText = primary.outdated ? 'N/A' : timePercent.toFixed(1) + '%';

    tooltip.appendMarkdown('<div align="center">\n\n');
    tooltip.appendMarkdown('### 🚀 5-Hour Session\n\n');
    tooltip.appendMarkdown('</div>\n\n');

    tooltip.appendMarkdown('<table style="width:100%; border-collapse: collapse; table-layout: fixed;">\n');
    tooltip.appendMarkdown('<colgroup>\n');
    tooltip.appendMarkdown('<col style="width:120px;">\n');
    tooltip.appendMarkdown('<col style="width:auto;">\n');
    tooltip.appendMarkdown('<col style="width:55px;">\n');
    tooltip.appendMarkdown('</colgroup>\n');
    tooltip.appendMarkdown(`<tr><td><strong>Usage:</strong></td><td>${createProgressBar(usagePercent, 'usage', primary.outdated)}</td><td style="text-align:right; vertical-align:middle;">${usageText}</td></tr>\n`);
    tooltip.appendMarkdown(`<tr><td><strong>Time Progress:</strong></td><td>${createProgressBar(timePercent, 'time', primary.outdated)}</td><td style="text-align:right;">${timeText}</td></tr>\n`);
    tooltip.appendMarkdown(`<tr><td colspan="3" style="padding-top:5px;"><strong>Reset:</strong> ${resetTimeStr}${outdatedStr}</td></tr>\n`);
    tooltip.appendMarkdown('</table>\n\n');
  }

  // Weekly info
  if (data.secondary) {
    const secondary = data.secondary;
    const resetTimeStr = secondary.reset_time.toLocaleString();
    const outdatedStr = secondary.outdated ? ' [OUTDATED]' : '';
    const usagePercent = secondary.outdated ? 0 : secondary.used_percent;
    const timePercent = secondary.outdated ? 0 : secondary.time_percent;
    const usageText = secondary.outdated ? 'N/A' : usagePercent.toFixed(1) + '%';
    const timeText = secondary.outdated ? 'N/A' : timePercent.toFixed(1) + '%';

    tooltip.appendMarkdown('<div align="center">\n\n');
    tooltip.appendMarkdown('### 📅 Weekly Limit\n\n');
    tooltip.appendMarkdown('</div>\n\n');

    tooltip.appendMarkdown('<table style="width:100%; border-collapse: collapse; table-layout: fixed;">\n');
    tooltip.appendMarkdown('<colgroup>\n');
    tooltip.appendMarkdown('<col style="width:120px;">\n');
    tooltip.appendMarkdown('<col style="width:auto;">\n');
    tooltip.appendMarkdown('<col style="width:55px;">\n');
    tooltip.appendMarkdown('</colgroup>\n');
    tooltip.appendMarkdown(`<tr><td><strong>Usage:</strong></td><td>${createProgressBar(usagePercent, 'usage', secondary.outdated)}</td><td style="text-align:right; vertical-align:middle;">${usageText}</td></tr>\n`);
    tooltip.appendMarkdown(`<tr><td><strong>Time Progress:</strong></td><td>${createProgressBar(timePercent, 'time', secondary.outdated)}</td><td style="text-align:right;">${timeText}</td></tr>\n`);
    tooltip.appendMarkdown(`<tr><td colspan="3" style="padding-top:5px;"><strong>Reset:</strong> ${resetTimeStr}${outdatedStr}</td></tr>\n`);
    tooltip.appendMarkdown('</table>\n\n');
  }

  // Token usage summary
  tooltip.appendMarkdown('---\n\n');
  tooltip.appendMarkdown('<div align="center">\n\n');
  tooltip.appendMarkdown('### 📊 Token Usage\n\n');
  tooltip.appendMarkdown('</div>\n\n');

  const total = data.total_usage;
  const last = data.last_usage;

  function formatTokenNumber(num: number): string {
    const numInK = Math.round(num / 1000);
    return numInK.toLocaleString('en-US') + ' K';
  }

  tooltip.appendMarkdown(`**Total:** input ${formatTokenNumber(total.input_tokens)}, cached ${formatTokenNumber(total.cached_input_tokens)}, output ${formatTokenNumber(total.output_tokens)}, reasoning ${formatTokenNumber(total.reasoning_output_tokens)}\n\n`);
  tooltip.appendMarkdown(`**Last:** input ${formatTokenNumber(last.input_tokens)}, cached ${formatTokenNumber(last.cached_input_tokens)}, output ${formatTokenNumber(last.output_tokens)}, reasoning ${formatTokenNumber(last.reasoning_output_tokens)}\n\n`);

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
      // If outdated, set usage to 0%
      primaryUsage = data.primary.outdated ? 0 : data.primary.used_percent;
      maxUsagePercent = Math.max(maxUsagePercent, primaryUsage);
    }

    if (data.secondary) {
      // If outdated, set usage to 0%
      weeklyUsage = data.secondary.outdated ? 0 : data.secondary.used_percent;
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
