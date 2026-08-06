import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import {
  Activity,
  ArrowDownUp,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  CloudUpload,
  Database,
  Gauge,
  Globe2,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Settings2,
  WifiOff
} from "lucide-react";
import { clearUsageEvents, listUsageEvents } from "./lib/repository";
import { getDeviceId, readConfig, writeConfig } from "./lib/storage";
import { readUsageFromWebDav, syncUsageToWebDav, testWebDav } from "./lib/webdav";
import { formatBytes, formatDuration, formatTime } from "./lib/format";

const RANGE_LABELS = { day: "今日", week: "本周", month: "本月" };
const TOP_RANK_LIMIT = 10;

function formatWebDavError(error) {
  if (error?.message === "Failed to fetch") {
    return "当前是本地预览页，浏览器拦截了 WebDAV 请求。请从已加载的 Chrome 插件页面测试。";
  }
  return error?.message || "连接失败，请检查配置";
}

function Chart({ option, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [option]);

  return <div ref={ref} className={`chart ${className}`} />;
}

function emptyChart(title, subtitle) {
  return {
    animation: false,
    title: {
      text: title,
      subtext: subtitle,
      left: "center",
      top: "38%",
      textStyle: { color: "#38516b", fontSize: 15, fontWeight: 600 },
      subtextStyle: { color: "#8297aa", fontSize: 12 }
    },
    xAxis: { show: false },
    yAxis: { show: false },
    series: []
  };
}

function getRangeStart(range) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(start.getDate() - 29);
  return start.getTime();
}

function summarize(events, range) {
  const filtered = events.filter((event) => event.startedAt >= getRangeStart(range));
  const byDomain = new Map();
  filtered.forEach((event) => {
    const item = byDomain.get(event.domain) || {
      domain: event.domain,
      seconds: 0,
      bytes: 0,
      lastActiveAt: 0
    };
    item.seconds += event.activeSeconds || 0;
    item.bytes += event.estimatedBytes || 0;
    item.lastActiveAt = Math.max(item.lastActiveAt, event.endedAt || 0);
    byDomain.set(event.domain, item);
  });
  const sites = [...byDomain.values()];
  return {
    events: filtered,
    totalSeconds: filtered.reduce((sum, event) => sum + (event.activeSeconds || 0), 0),
    totalBytes: filtered.reduce((sum, event) => sum + (event.estimatedBytes || 0), 0),
    sites,
    lastEvent: filtered[0]
  };
}

function buildTrendOption(events) {
  if (!events.length) return emptyChart("等待第一条记录", "活动标签页数据会显示在这里");
  const hours = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}时`);
  const values = Array(24).fill(0);
  events.forEach((event) => {
    values[new Date(event.startedAt).getHours()] += event.activeSeconds || 0;
  });
  return {
    grid: { left: 38, right: 18, top: 24, bottom: 28 },
    tooltip: { trigger: "axis", valueFormatter: (value) => formatDuration(value) },
    xAxis: { type: "category", data: hours, axisLabel: { color: "#71859a" }, axisLine: { lineStyle: { color: "#d7e3ee" } } },
    yAxis: { type: "value", axisLabel: { color: "#71859a" }, splitLine: { lineStyle: { color: "#e5edf5" } } },
    series: [{ type: "line", smooth: true, data: values, symbol: "none", lineStyle: { color: "#2563eb", width: 3 }, areaStyle: { color: "rgba(37, 99, 235, 0.14)" } }]
  };
}

function buildRankingOption(sites, metric) {
  if (!sites.length) return emptyChart("暂无网站排行", "有活动后会自动生成排行");
  const items = [...sites]
    .sort((a, b) => b[metric] - a[metric] || b.lastActiveAt - a.lastActiveAt || a.domain.localeCompare(b.domain))
    .slice(0, TOP_RANK_LIMIT)
    .reverse();
  return {
    grid: { left: 90, right: 24, top: 18, bottom: 18 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value) => metric === "seconds" ? formatDuration(value) : formatBytes(value)
    },
    xAxis: { type: "value", show: false },
    yAxis: { type: "category", data: items.map((item) => item.domain), axisLabel: { color: "#536b82" } },
    series: [{ type: "bar", data: items.map((item) => item[metric]), barWidth: 14, itemStyle: { color: metric === "seconds" ? "#4ac9de" : "#f3a65a", borderRadius: [0, 8, 8, 0] } }]
  };
}

function StatCard({ icon: Icon, label, value, detail, accent }) {
  return (
    <div className={`stat-card ${accent}`}>
      <div className="stat-icon"><Icon size={19} /></div>
      <div>
        <div className="eyebrow">{label}</div>
        <div className="stat-value">{value}</div>
        <div className="stat-detail">{detail}</div>
      </div>
    </div>
  );
}

function Dashboard({ events, range, setRange, config, onRefresh }) {
  const [sortBy, setSortBy] = useState("seconds");
  const [showAllSites, setShowAllSites] = useState(false);
  const summary = useMemo(() => summarize(events, range), [events, range]);
  const sortedSites = useMemo(
    () => [...summary.sites].sort((a, b) => b[sortBy] - a[sortBy] || b.lastActiveAt - a.lastActiveAt || a.domain.localeCompare(b.domain)),
    [summary.sites, sortBy]
  );
  const visibleSites = showAllSites ? sortedSites : sortedSites.slice(0, TOP_RANK_LIMIT);
  const hasMoreSites = sortedSites.length > TOP_RANK_LIMIT;
  const trendOption = useMemo(() => buildTrendOption(summary.events), [summary.events]);
  const timeRankOption = useMemo(() => buildRankingOption(summary.sites, "seconds"), [summary.sites]);
  const trafficRankOption = useMemo(() => buildRankingOption(summary.sites, "bytes"), [summary.sites]);

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOCAL ACTIVITY TELEMETRY</div>
          <h1>使用统计</h1>
          <p>只记录浏览器本地活动事件，流量为页面资源估算值。</p>
        </div>
        <button className="icon-button" onClick={onRefresh} title="刷新统计"><RefreshCw size={18} /></button>
      </div>

      <div className="range-switcher" role="tablist" aria-label="统计范围">
        {Object.entries(RANGE_LABELS).map(([key, label]) => (
          <button key={key} className={range === key ? "active" : ""} onClick={() => setRange(key)}>{label}</button>
        ))}
      </div>

      <section className="stats-grid">
        <StatCard icon={Clock3} label="使用时长" value={formatDuration(summary.totalSeconds)} detail={`${summary.events.length} 条本地事件`} accent="teal" />
        <StatCard icon={Gauge} label="估算流量" value={formatBytes(summary.totalBytes)} detail="来自页面资源计时 API" accent="orange" />
        <StatCard icon={Globe2} label="活跃网站" value={`${summary.sites.length}`} detail="按域名归并" accent="blue" />
        <StatCard icon={CloudUpload} label="同步状态" value={config.url ? "已配置" : "未配置"} detail={config.url ? "WebDAV 等待同步" : "前往设置页配置"} accent="green" />
      </section>

      <section className="chart-grid">
        <article className="panel wide-panel">
          <div className="panel-heading"><div><span className="panel-kicker"><Activity size={15} /> 活动曲线</span><h2>{RANGE_LABELS[range]}使用趋势</h2></div><span className="muted-label">小时分布</span></div>
          <Chart option={trendOption} />
        </article>
        <article className="panel">
          <div className="panel-heading"><div><span className="panel-kicker"><Clock3 size={15} /> 时长排行</span><h2>常用网站</h2></div><span className="muted-label">前 10 名</span></div>
          <Chart option={timeRankOption} />
        </article>
        <article className="panel">
          <div className="panel-heading"><div><span className="panel-kicker"><Database size={15} /> 估算流量</span><h2>资源用量排行</h2></div><span className="muted-label">前 10 名</span></div>
          <Chart option={trafficRankOption} />
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading table-heading"><div><span className="panel-kicker"><ArrowDownUp size={15} /> 明细数据</span><h2>网站统计</h2></div><div className="table-heading-actions"><span className="muted-label">显示 {visibleSites.length} / {sortedSites.length} 个域名</span>{hasMoreSites && <button className="detail-button" onClick={() => setShowAllSites((current) => !current)} aria-expanded={showAllSites}>{showAllSites ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{showAllSites ? "收起详情" : "查看全部详情"}</button>}</div></div>
        {sortedSites.length === 0 ? <EmptyState /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>网站</th><th><button className={`sort-button ${sortBy === "seconds" ? "active" : ""}`} onClick={() => setSortBy("seconds")}>使用时长 <ArrowDownUp size={13} /></button></th><th><button className={`sort-button ${sortBy === "bytes" ? "active" : ""}`} onClick={() => setSortBy("bytes")}>估算流量 <ArrowDownUp size={13} /></button></th><th><button className={`sort-button ${sortBy === "lastActiveAt" ? "active" : ""}`} onClick={() => setSortBy("lastActiveAt")}>最后活动 <ArrowDownUp size={13} /></button></th></tr></thead>
              <tbody>{visibleSites.map((site) => <tr key={site.domain}><td><span className="domain-dot" />{site.domain}</td><td>{formatDuration(site.seconds)}</td><td>{formatBytes(site.bytes)}</td><td>{formatTime(site.lastActiveAt)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function EmptyState() {
  return <div className="empty-state"><div className="empty-icon"><WifiOff size={23} /></div><strong>数据仓库为空</strong><span>打开网页并保持活动标签页，统计事件会自动写入本地仓库。</span></div>;
}

function Settings({ config, setConfig, events, onSaved }) {
  const [form, setForm] = useState({ url: "https://dav.jianguoyun.com/dav/", username: "", password: "", path: "browser-usage", interval: "15", ...config });
  const [status, setStatus] = useState({ type: "idle", text: "" });

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    await writeConfig(form);
    setConfig(form);
    onSaved();
    setStatus({ type: "success", text: "设置已保存" });
  };
  const test = async () => {
    setStatus({ type: "loading", text: "正在连接 WebDAV..." });
    try {
      await testWebDav(form);
      setStatus({ type: "success", text: "连接成功" });
    } catch (error) {
      setStatus({ type: "error", text: formatWebDavError(error) });
    }
  };

  const syncNow = async () => {
    setStatus({ type: "loading", text: "正在上传今日统计..." });
    try {
      const deviceId = await getDeviceId();
      const count = await syncUsageToWebDav(form, events, deviceId);
      setStatus({ type: "success", text: `同步成功，已上传 ${count} 条事件` });
    } catch (error) {
      setStatus({ type: "error", text: formatWebDavError(error) });
    }
  };

  return <main className="page-shell settings-page"><div className="page-heading"><div><div className="eyebrow">STORAGE & SYNC</div><h1>存储设置</h1><p>配置 WebDAV 同步目标，实时统计仍然优先保存在本地。</p></div><div className="settings-heading-icon"><Settings2 size={23} /></div></div>
    <section className="settings-layout"><article className="panel settings-panel"><div className="panel-heading"><div><span className="panel-kicker"><CloudUpload size={15} /> DAV CONNECTION</span><h2>WebDAV 连接</h2></div></div><div className="form-grid"><label><span>DAV 地址</span><input value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://dav.example.com/dav/" /></label><label><span>存储目录</span><input value={form.path} onChange={(event) => update("path", event.target.value)} placeholder="browser-usage" /></label><label><span>账号</span><div className="input-with-icon"><KeyRound size={16} /><input value={form.username} onChange={(event) => update("username", event.target.value)} placeholder="坚果云账号邮箱" /></div></label><label><span>应用密码</span><input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="使用第三方应用密码" /></label><label><span>自动同步间隔</span><select value={form.interval} onChange={(event) => update("interval", event.target.value)}><option value="5">每 5 分钟</option><option value="15">每 15 分钟</option><option value="30">每 30 分钟</option><option value="60">每 60 分钟</option></select></label></div><div className="form-actions"><button className="secondary-button" onClick={test}><WifiOff size={16} /> 测试连接</button><button className="secondary-button" onClick={syncNow}><CloudUpload size={16} /> 立即同步</button><button className="primary-button" onClick={save}><CheckCircle2 size={16} /> 保存设置</button></div>{status.text && <div className={`status-message ${status.type}`}>{status.type === "loading" && <LoaderCircle size={15} className="spin" />}{status.type === "success" && <CheckCircle2 size={15} />}{status.text}</div>}<div className="security-note"><KeyRound size={16} /><span>请使用坚果云第三方应用密码。配置只保存在当前插件的本地存储中。</span></div></article><aside className="panel side-note"><CalendarDays size={24} /><h2>同步策略</h2><p>本地 IndexedDB 先记录事件，插件按时间窗口汇总后再上传 WebDAV，减少频繁请求和文件冲突。</p><div className="side-note-row"><span>本地数据</span><b>优先</b></div><div className="side-note-row"><span>远程同步</span><b>可选</b></div></aside></section></main>;
}

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [range, setRange] = useState("day");
  const [events, setEvents] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const [localEvents, nextConfig] = await Promise.all([listUsageEvents(), readConfig()]);
    let remoteEvents = [];
    if (nextConfig.url && nextConfig.username && nextConfig.password) {
      try {
        remoteEvents = await readUsageFromWebDav(nextConfig);
      } catch {
        remoteEvents = [];
      }
    }
    const mergedEvents = new Map([...localEvents, ...remoteEvents].map((event) => [event.id, event]));
    setEvents([...mergedEvents.values()].sort((a, b) => b.startedAt - a.startedAt));
    setConfig(nextConfig);
    setLoading(false);
  };

  useEffect(() => { refresh().catch(() => setLoading(false)); }, []);

  const handleClear = async () => {
    if (!window.confirm("确定要清空本地统计数据吗？")) return;
    await clearUsageEvents();
    await refresh();
  };

  return <div className="app-frame"><header className="topbar"><div className="brand-mark"><span className="brand-pulse" /><div><strong>CHROME USAGE</strong><small>LOCAL ANALYTICS</small></div></div><nav><button className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}><Activity size={16} /> 统计看板</button><button className={activePage === "settings" ? "active" : ""} onClick={() => setActivePage("settings")}><Settings2 size={16} /> 存储设置</button></nav><div className="topbar-status"><span className="status-dot" />本地采集中</div></header>{loading ? <div className="loading-state"><LoaderCircle size={22} className="spin" />正在读取本地数据</div> : activePage === "dashboard" ? <Dashboard events={events} range={range} setRange={setRange} config={config} onRefresh={refresh} /> : <Settings config={config} setConfig={setConfig} events={events} onSaved={refresh} />}<footer className="app-footer"><span>数据仓库：IndexedDB / chromeUsageDB</span><button onClick={handleClear}>清空本地数据</button></footer></div>;
}
