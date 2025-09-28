# Codex Rate Limit Monitor

A Visual Studio Code/Cursor/Windsurf extension for monitoring OPENAI Codex rate limits in real-time.

## Features

- **Status Bar Display**: Shows 5-hour and weekly usage percentages directly in the VSCode status bar
- **Color-coded Indicators**: Visual warnings when approaching rate limits
- **Detailed View**: Click the status bar to see comprehensive rate limit information
- **Automatic Updates**: Refreshes every 10 seconds to keep data current
- **TUI-style Interface**: Familiar progress bars similar to the Python CLI tool

## Installation

### Package and Install the Extension

#### Step 1: Install VSCE (VSCode Extension Manager)
```bash
npm install -g @vscode/vsce
```

#### Step 2: Package the Extension
```bash
# Navigate to the extension directory
cd codex-ratelimit-vscode

# Install dependencies and compile
npm install
npm run compile

# Package into .vsix file
vsce package
```

This creates a `codex-ratelimit-X.X.X.vsix` file.

#### Step 3: Install the Packaged Extension

**Option A: Using VSCode UI**
1. Open VSCode
2. Go to Extensions panel (`Ctrl+Shift+X` or `Cmd+Shift+X`)
3. Click the `...` menu → "Install from VSIX..."
4. Select the `.vsix` file you created

**Option B: Using Command Line**
```bash
code --install-extension codex-ratelimit-X.X.X.vsix
```

**Option C: Using VSCode Command Palette**
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Extensions: Install from VSIX..."
3. Select the `.vsix` file

#### Step 4: Reload VSCode
After installation, reload VSCode window (`Ctrl+Shift+P` → "Developer: Reload Window") to activate the extension.

## Usage

### Status Bar

The extension displays rate limit information in the VSCode status bar:

```
⚡ 5H: 45% | Weekly: 23%
```

- **5H**: 5-hour session usage percentage
- **Weekly**: Weekly limit usage percentage
- Colors change based on usage levels (green → yellow → red)

### Detailed View

Click the status bar item or use the command `Codex Rate Limit: Show Details` to open a detailed view showing:

- 5-hour session progress (time and usage)
- Weekly limit progress (time and usage)
- Reset times and outdated status indicators
- Token usage summary

## Commands

- `codex-ratelimit.refreshStats` - Manually refresh rate limit data
- `codex-ratelimit.showDetails` - Open detailed rate limit view
- `codex-ratelimit.openSettings` - Open extension settings page

## Configuration

The extension can be configured through VSCode settings:

- `codexRatelimit.enableLogging` - Enable detailed logging for debugging
- `codexRatelimit.enableStatusBarColors` - Enable color-coded status bar
- `codexRatelimit.warningThreshold` - Usage percentage for warning colors (default: 70%)
- `codexRatelimit.refreshInterval` - How often to refresh stats in seconds (5-3600, default: 10)
- `codexRatelimit.sessionPath` - Custom path to Codex sessions directory

## How It Works

The extension monitors Codex session files located at `~/.codex/sessions/` by default. It:

1. Searches for the latest `token_count` events in session files
2. Extracts rate limit information (5-hour and weekly limits)
3. Calculates usage percentages and time progress
4. Updates the status bar every 10 seconds
5. Handles outdated data and error states gracefully

## Development

### Requirements

- Visual Studio Code 1.96.0 or higher
- Node.js for development

### Setup for Development and Testing

1. **Open the extension directory in VSCode**
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Compile TypeScript:**
   ```bash
   npm run compile
   ```
4. **Press `F5`** to launch a new Extension Development Host window
5. The extension will activate automatically

### Development Workflow

```bash
# Watch for changes (auto-recompile on file changes)
npm run watch

# Manual compilation when needed
npm run compile

# Run the extension for testing
# Press F5 in VSCode to launch Extension Development Host
```

### Publishing to VSCode Marketplace (Optional)

To publish to the official VSCode Marketplace:

```bash
# First time setup
vsce login <publisher-name>

# Publish
vsce publish
```

Note: You'll need to create a publisher account at https://marketplace.visualstudio.com/manage first.

## Architecture

```
src/
├── extension.ts           # Main extension entry point
├── services/
│   ├── ratelimitParser.ts # Core logic for parsing session files
│   └── logger.ts          # Logging utilities
├── handlers/
│   ├── statusBar.ts       # Status bar management
│   └── webView.ts         # Detailed view WebView
├── utils/
│   └── updateStats.ts     # Stats update and refresh logic
└── interfaces/
    └── types.ts           # TypeScript type definitions
```

## License

MIT License