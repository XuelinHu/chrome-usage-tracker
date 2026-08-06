const fallbackKey = "chrome-usage-tracker-config";

export async function readConfig() {
  if (globalThis.chrome?.storage?.local) {
    const result = await chrome.storage.local.get("webdavConfig");
    return result.webdavConfig || {};
  }

  try {
    return JSON.parse(localStorage.getItem(fallbackKey) || "{}");
  } catch {
    return {};
  }
}

export async function writeConfig(config) {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ webdavConfig: config });
    return;
  }
  localStorage.setItem(fallbackKey, JSON.stringify(config));
}

export async function getDeviceId() {
  const config = await readConfig();
  if (config.deviceId) return config.deviceId;
  const deviceId = `profile-${crypto.randomUUID().slice(0, 8)}`;
  await writeConfig({ ...config, deviceId });
  return deviceId;
}
