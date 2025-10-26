# Changelog

All notable changes to this project will be documented in this file.

## [0.10.0] - 2025-10-27
- Add customizable color settings for status bar and webview progress indicators with warning/critical thresholds.
- Improve tooltips and webview displays to handle outdated data and format token totals more readably.
- Make the rate limit parser resilient to missing usage payloads while keeping the UI responsive.
- Support new input data format with both absolute (`resets_at`) and relative (`resets_in_seconds`) timestamp formats.
- Add validation for `window_minutes` to prevent calculation errors with invalid or missing window data.
- Improve reset time calculation accuracy by using current time instead of record timestamp.

## [0.9.0] - 2025-09-28
- First public release of the Codex Rate Limit Monitor extension
