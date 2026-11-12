import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bot, DatabaseZap, Flame, LineChart, Menu, Network, X } from "lucide-react";
import { api, type JsonMap } from "./api";
import { Loading } from "./components";
import Home from "./pages/Home";

const StockOverview = lazy(() => import("./pages/StockOverview").then((module) => ({ default: module.StockOverview })));
const WatchlistAnomalies = lazy(() => import("./pages/WatchlistAnomalies").then((module) => ({ default: module.WatchlistAnomalies })));
const IndexConstituents = lazy(() => import("./pages/IndexConstituents").then((module) => ({ default: module.IndexConstituents })));
const HeatRadar = lazy(() => import("./pages/HeatRadar").then((module) => ({ default: module.HeatRadar })));
const Chat = lazy(() => import("./pages/Chat").then((module) => ({ default: module.Chat })));
const DataStatus = lazy(() => import("./pages/DataStatus").then((module) => ({ default: module.DataStatus })));

const pages = [
  { id: "stock", group: "研究", label: "个股研究", icon: LineChart, component: StockOverview },
  { id: "watchlist", group: "研究", label: "自选异动", icon: Activity, component: WatchlistAnomalies },
  { id: "concept", group: "研究", label: "指数与板块", icon: Network, component: IndexConstituents },
  { id: "heat", group: "观察", label: "热度雷达", icon: Flame, component: HeatRadar },
  { id: "chat", group: "助手", label: "研究助手", icon: Bot, component: Chat },
  { id: "data", group: "系统", label: "数据状态", icon: DatabaseZap, component: DataStatus },
] as const;

function currentPage() {
  const value = window.location.hash.replace("#", "");
  return value === "home" || pages.some((page) => page.id === value) ? value : "home";
}

function cacheLabel(status: ReturnType<typeof useQuery<JsonMap>>, online: boolean) {
  const cache = status.data?.cache as JsonMap | undefined;
  if (!online || status.isLoading || !cache) return "检测中";
  return cache.connected ? "Redis" : cache.local_memory ? "本地缓存" : "关闭";
}

export default function App() {
  const [active, setActive] = useState(currentPage());
  const [mobileOpen, setMobileOpen] = useState(false);
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.get<JsonMap>("/health", 8_000), refetchInterval: 30_000, retry: 1 });
  const status = useQuery({ queryKey: ["system-status"], queryFn: () => api.get<JsonMap>("/data-sources/status", 15_000), refetchInterval: 60_000, retry: 1, enabled: Boolean(health.data) });
  useEffect(() => { const listener = () => setActive(currentPage()); window.addEventListener("hashchange", listener); return () => window.removeEventListener("hashchange", listener); }, []);

  if (active === "home") return <Home online={Boolean(health.data)} cache={cacheLabel(status, Boolean(health.data))} toolCount={status.data?.agent?.tool_count ?? null} />;
  const Page = pages.find((page) => page.id === active)?.component || StockOverview;
  return <div className="app-shell">
    <a className="skip-link" href="#main-workspace">跳到主内容</a>
    <aside className={mobileOpen ? "sidebar open" : "sidebar"} aria-label="主导航">
      <div className="brand"><a className="brand-mark" href="#home" aria-label="返回首页">AR</a><a className="brand-copy" href="#home"><strong>A-Research</strong><span>A 股研究台</span></a><button className="sidebar-close" type="button" aria-label="关闭导航" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <nav>{pages.map((page, index) => { const Icon = page.icon; const showGroup = index === 0 || pages[index - 1].group !== page.group; return <div key={page.id} className="nav-item-wrap">{showGroup && <span className="nav-section">{page.group}</span>}<a href={`#${page.id}`} className={active === page.id ? "active" : ""} onClick={() => setMobileOpen(false)}><Icon size={18} /><span>{page.label}</span></a></div>; })}</nav>
      <div className="sidebar-status"><a className="status-home" href="#home">返回首页</a><div><i className={health.data ? "online" : ""} /><span>{health.isLoading ? "检查服务…" : health.data ? "后端已连接" : "后端离线"}</span></div><dl><div><dt>缓存</dt><dd>{cacheLabel(status, Boolean(health.data))}</dd></div><div><dt>Fuyao</dt><dd>{status.data?.fuyao?.api_key_configured ? "就绪" : "未配置"}</dd></div><div><dt>工具</dt><dd>{status.data?.agent?.tool_count ?? "-"}</dd></div></dl></div>
      <p className="disclaimer">数据仅供研究参考，不构成投资建议</p>
    </aside>
    {mobileOpen && <button className="backdrop" type="button" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
    <main id="main-workspace"><div className="mobile-bar"><button className="icon-button" type="button" aria-label="打开导航" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><strong>A-Research</strong></div><Suspense fallback={<Loading label="加载页面…" />}><Page /></Suspense></main>
  </div>;
}
