const DB_NAME = "chromeUsageDB";
const DB_VERSION = 2;
const STORE_NAME = "usageEvents";
const CONFIG_KEY = "webdavConfig";

let focusedWindowId = chrome.windows.WINDOW_ID_NONE;
let activeTabId = null;
let activeDomain = "未知页面";
let activeTitle = "";
let trackingStartedAt = null;
let idleState = "active";
const pendingBytesByTab = new Map();

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt", { unique: false });
      } else {
        const store = request.transaction.objectStore(STORE_NAME);
        if (!store.indexNames.contains("startedAt")) {
          store.createIndex("startedAt", "startedAt", { unique: false });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveUsageEvent(event) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(event);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function listUsageEvents(startAt, endAt) {
  const db = await openDatabase();
  const events = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .index("startedAt")
      .getAll(IDBKeyRange.bound(startAt, endAt));
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return events;
}

async function getWebDavConfig() {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  return result[CONFIG_KEY] || {};
}

function getWebDavBaseUrl(config) {
  return `${config.url.replace(/\/+$/, "")}/${(config.path || "browser-usage").replace(/^\/+|\/+$/g, "")}`;
}

function getWebDavAuth(config) {
  return `Basic ${btoa(`${config.username}:${config.password}`)}`;
}

async function makeCollection(url, config) {
  const response = await fetch(url, {
    method: "MKCOL",
    headers: { Authorization: getWebDavAuth(config) }
  });
  if (![201, 405, 409].includes(response.status)) {
    throw new Error(`MKCOL ${response.status}`);
  }
}

async function syncToday() {
  const config = await getWebDavConfig();
  if (!config.url || !config.username || !config.password) return;

  const deviceId = config.deviceId || `profile-${crypto.randomUUID().slice(0, 8)}`;
  const baseUrl = getWebDavBaseUrl(config);
  const today = new Date().toISOString().slice(0, 10);
  const dateUrl = `${baseUrl}/${today}`;
  const dayStart = Date.parse(`${today}T00:00:00.000Z`);
  const events = await listUsageEvents(dayStart, dayStart + 24 * 60 * 60 * 1000 - 1);

  await makeCollection(baseUrl, config);
  await makeCollection(dateUrl, config);
  const response = await fetch(`${dateUrl}/${deviceId}.json`, {
    method: "PUT",
    headers: {
      Authorization: getWebDavAuth(config),
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ schemaVersion: 1, deviceId, generatedAt: new Date().toISOString(), events })
  });
  if (!response.ok) throw new Error(`PUT ${response.status}`);

  await chrome.storage.local.set({
    [CONFIG_KEY]: { ...config, deviceId, lastSyncAt: Date.now() }
  });
}

async function maybeSync() {
  try {
    const config = await getWebDavConfig();
    const interval = Math.max(5, Number(config.interval) || 15) * 60 * 1000;
    if (!config.lastSyncAt || Date.now() - config.lastSyncAt >= interval) {
      await syncToday();
    }
  } catch (error) {
    console.warn("WebDAV 自动同步失败", error);
  }
}

function getDomain(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "浏览器内部页面";
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "未知页面";
  }
}

function shouldTrack() {
  return focusedWindowId !== chrome.windows.WINDOW_ID_NONE &&
    activeTabId !== null &&
    idleState === "active";
}

async function flushCurrentSegment(reason) {
  if (!trackingStartedAt || activeTabId === null) return;

  const endedAt = Date.now();
  const activeSeconds = Math.floor((endedAt - trackingStartedAt) / 1000);
  const estimatedBytes = pendingBytesByTab.get(activeTabId) || 0;

  if (activeSeconds >= 1 || estimatedBytes > 0) {
    await saveUsageEvent({
      id: `${trackingStartedAt}-${activeTabId}-${crypto.randomUUID()}`,
      startedAt: trackingStartedAt,
      endedAt,
      activeSeconds,
      estimatedBytes,
      tabId: activeTabId,
      domain: activeDomain,
      title: activeTitle,
      reason
    });
  }

  pendingBytesByTab.delete(activeTabId);
  trackingStartedAt = shouldTrack() ? endedAt : null;
}

async function activateCurrentContext() {
  if (focusedWindowId === chrome.windows.WINDOW_ID_NONE || idleState !== "active") {
    activeTabId = null;
    trackingStartedAt = null;
    return;
  }

  const tabs = await chrome.tabs.query({
    windowId: focusedWindowId,
    active: true
  });
  const tab = tabs[0];
  if (!tab) return;

  activeTabId = tab.id;
  activeDomain = getDomain(tab.url);
  activeTitle = tab.title || activeDomain;
  trackingStartedAt = Date.now();
}

async function refreshFocus() {
  const window = await chrome.windows.getLastFocused();
  focusedWindowId = window?.id ?? chrome.windows.WINDOW_ID_NONE;
  await activateCurrentContext();
}

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await flushCurrentSegment("window-focus");
  focusedWindowId = windowId;
  await activateCurrentContext();
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  if (windowId !== focusedWindowId) return;
  await flushCurrentSegment("tab-activated");
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  activeTabId = tabId;
  activeDomain = getDomain(tab?.url);
  activeTitle = tab?.title || activeDomain;
  trackingStartedAt = shouldTrack() ? Date.now() : null;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeTabId || (!changeInfo.url && changeInfo.status !== "complete")) return;
  await flushCurrentSegment("navigation");
  activeDomain = getDomain(tab.url);
  activeTitle = tab.title || activeDomain;
  trackingStartedAt = shouldTrack() ? Date.now() : null;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId !== activeTabId) return;
  await flushCurrentSegment("tab-closed");
  activeTabId = null;
  trackingStartedAt = null;
});

chrome.idle.onStateChanged.addListener(async (state) => {
  await flushCurrentSegment(`idle-${state}`);
  idleState = state;
  if (state === "active") await refreshFocus();
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "resource-estimate" || !sender.tab?.id) return;
  const previous = pendingBytesByTab.get(sender.tab.id) || 0;
  pendingBytesByTab.set(sender.tab.id, previous + Math.max(0, Number(message.bytes) || 0));
});

chrome.alarms.create("flush-usage", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "flush-usage") return;
  await flushCurrentSegment("periodic-flush");
  await maybeSync();
});

refreshFocus().catch(() => {});
