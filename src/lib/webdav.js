function getBaseUrl(config) {
  const path = config.path || "browser-usage";
  return `${config.url.replace(/\/+$/, "")}/${path.replace(/^\/+|\/+$/g, "")}`;
}

function getRootUrl(config) {
  return `${config.url.replace(/\/+$/, "")}/`;
}

function getAuthHeader(config) {
  const auth = btoa(`${config.username}:${config.password}`);
  return `Basic ${auth}`;
}

export async function testWebDav(config) {
  if (!config.url || !config.username || !config.password) {
    throw new Error("请先填写 DAV 地址、账号和第三方应用密码");
  }

  const response = await fetch(getRootUrl(config), {
    method: "PROPFIND",
    headers: {
      Authorization: getAuthHeader(config),
      Depth: "0"
    }
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`认证失败（${response.status}），请确认账号和第三方应用密码`);
  }
  if (response.status === 404) {
    throw new Error("DAV 地址不存在，请确认地址为 https://dav.jianguoyun.com/dav/");
  }
  if (!response.ok && response.status !== 207) {
    throw new Error(`DAV 根地址返回 ${response.status}`);
  }

  await createCollection(getBaseUrl(config), config);
  return true;
}

async function createCollection(url, config) {
  const response = await fetch(url, {
    method: "MKCOL",
    headers: { Authorization: getAuthHeader(config) }
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`创建目录认证失败（${response.status}）`);
  }
  if (response.status === 409) {
    throw new Error("创建目录失败（409），请确认 DAV 路径和上级目录存在");
  }
  if (![201, 405].includes(response.status)) {
    throw new Error(`创建 WebDAV 目录失败：${response.status}`);
  }
}

export async function syncUsageToWebDav(config, events, deviceId) {
  if (!config.url || !config.username || !config.password) {
    throw new Error("请先完整填写 WebDAV 地址、账号和应用密码");
  }

  const baseUrl = getBaseUrl(config);
  await testWebDav(config);
  const date = new Date().toISOString().slice(0, 10);
  const dateUrl = `${baseUrl}/${date}`;
  await createCollection(dateUrl, config);

  const payload = {
    schemaVersion: 1,
    deviceId,
    generatedAt: new Date().toISOString(),
    events: events.filter((event) => new Date(event.startedAt).toISOString().slice(0, 10) === date)
  };
  const response = await fetch(`${dateUrl}/${deviceId}.json`, {
    method: "PUT",
    headers: {
      Authorization: getAuthHeader(config),
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`上传统计文件失败：${response.status}`);
  return payload.events.length;
}

export async function readUsageFromWebDav(config) {
  if (!config.url || !config.username || !config.password) return [];

  const folderUrl = `${getBaseUrl(config)}/${new Date().toISOString().slice(0, 10)}`;
  const listing = await fetch(folderUrl, {
    method: "PROPFIND",
    headers: {
      Authorization: getAuthHeader(config),
      Depth: "1"
    }
  });
  if (listing.status === 404) return [];
  if (!listing.ok && listing.status !== 207) throw new Error(`读取 WebDAV 目录失败：${listing.status}`);

  const xml = await listing.text();
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const hrefs = [...document.getElementsByTagNameNS("*", "href")]
    .map((node) => node.textContent?.trim())
    .filter(Boolean);
  const files = [...new Set(hrefs.map((href) => new URL(href, `${folderUrl}/`).toString()))]
    .filter((url) => new URL(url).pathname.endsWith(".json"));

  const payloads = await Promise.all(files.map(async (url) => {
    const response = await fetch(url, {
      headers: { Authorization: getAuthHeader(config) }
    });
    if (!response.ok) return null;
    return response.json();
  }));
  return payloads.flatMap((payload) => Array.isArray(payload?.events) ? payload.events : []);
}
