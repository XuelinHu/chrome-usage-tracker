# Chrome Usage Tracker

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-34a853)](public/manifest.json)
[![React](https://img.shields.io/badge/react-19-61dafb)](package.json)
[![Vite](https://img.shields.io/badge/vite-6-646cff)](package.json)

A Chrome extension that tracks browsing activity locally — usage time and page resource estimates — without sending data to third parties.

## Features

- Daily / weekly / monthly usage summaries
- Estimated page resource traffic (via Performance API)
- Domain ranking by time spent and data consumed
- WebDAV sync support (Jianguoyun, Nextcloud, etc.)
- All data stored in local IndexedDB

## Tech Stack

- React 19 + ECharts 6
- Vite 6
- Chrome Extension Manifest V3
- IndexedDB

## Development

```bash
npm install
npm run dev      # Start Vite dev server
npm run build    # Build the extension
```

## Install in Chrome

1. `npm run build`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. "Load unpacked" → select the `dist/` directory
