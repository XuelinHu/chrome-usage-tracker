# Chrome Usage Tracker

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-34a853)](public/manifest.json)
[![React](https://img.shields.io/badge/react-19-61dafb)](package.json)
[![Vite](https://img.shields.io/badge/vite-6-646cff)](package.json)
[![Build](https://github.com/XuelinHu/chrome-usage-tracker/actions/workflows/release.yml/badge.svg)](https://github.com/XuelinHu/chrome-usage-tracker/actions/workflows/release.yml)

A Chrome extension that tracks browsing activity locally — usage time and page resource estimates — without sending data to third parties.

## Features

- Daily / weekly / monthly usage summaries
- Estimated page resource traffic (via Performance API)
- Domain ranking by time spent and data consumed
- Paginated website detail table (10 domains per page)
- WebDAV sync support (Jianguoyun, Nextcloud, etc.)
- All data stored in local IndexedDB

## Tech Stack

- React 19 + ECharts 6
- Vite 6
- Chrome Extension Manifest V3
- IndexedDB

## Download & Install

### From GitHub Releases

1. Go to [Releases](https://github.com/XuelinHu/chrome-usage-tracker/releases)
2. Download `chrome-usage-tracker.zip` from the latest release
3. Unzip to a local folder
4. Open `chrome://extensions/` in Chrome
5. Enable "Developer mode" (top right)
6. Click "Load unpacked" and select the unzipped folder

### From Source

```bash
git clone git@github.com:XuelinHu/chrome-usage-tracker.git
cd chrome-usage-tracker
npm install
npm run build
# Then load the dist/extension/ folder as unpacked extension
```

## Development

```bash
npm install
npm run dev      # Start Vite dev server
npm run build    # Build extension assets
npm test         # Check detail-table pagination boundaries
```

## Android Usage Insights

`android/` contains a separate native Android app that reads per-application foreground time through Android Usage Access. It does not inspect Chrome page content or URLs. AI analysis is optional and sends only app labels, package names, and usage minutes after the user taps Analyze. The default OpenAI-compatible endpoint is the LAN model at `192.168.1.9:11434`; change the endpoint and model in AI connection settings. An optional cloud API Key is encrypted with Android Keystore and sent as a Bearer token only over HTTPS; private-LAN HTTP connections are allowed only without a key.

The Android app lists 20 applications per page. Chrome dashboard history is queried through a `startedAt` IndexedDB index and bounded to the latest 31 days; background WebDAV sync reads only the current UTC day.

Build the release APK with Android SDK 36 and JDK 17:

```powershell
cd android
\.\gradlew.bat assembleRelease
Copy-Item app\build\outputs\apk\release\app-release.apk ..\dist\usage-insights-release.apk -Force
```

The release currently uses the debug signing key for installation/testing, not store distribution. Grant Usage Access in Android Settings before viewing statistics. No database or cache server is required; usage data is queried from Android on demand.

## Publish to Chrome Web Store

1. Zip the `dist/extension/` folder (or download from Releases)
2. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay the one-time \$5 registration fee
4. Click "New Item" → upload the zip
5. Fill in description, screenshots, and privacy policy
6. Submit for review

## CI/CD

GitHub Actions auto-builds the extension on every push to `master` and creates a Release with the packaged zip when a tag (e.g. `v1.0.0`) is pushed.

## 启动端口

网页入口：4033；后台服务：无独立后端。完整启动约定见 [PORTS.md](./PORTS.md)。
