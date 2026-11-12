import { useQuery } from "@tanstack/react-query";
import { DatabaseZap, RefreshCw } from "lucide-react";
import { api, type JsonMap } from "../api";
import { DataTable, ErrorState, Loading, Metric, Panel } from "../components";

function yes(value: unknown) {
  return value ? "是" : "否";
}

function cacheMode(cache?: JsonMap) {
  if (!cache) return "检测中";
  if (cache.connected) return "Redis";
  if (cache.local_memory || cache.configured) return "本地缓存";
  return "关闭";
}

export function DataStatus() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.get<JsonMap>("/health", 8_000), refetchInterval: 30_000, retry: 1 });
  const status = useQuery({ queryKey: ["system-status"], queryFn: () => api.get<JsonMap>("/data-sources/status", 15_000), refetchInterval: 60_000, retry: 1 });
  const cache = status.data?.cache as JsonMap | undefined;
  const rows = [
    { area: "后端 API", state: health.data ? "已连接" : health.isLoading ? "检测中" : "离线", detail: health.data?.status || "-" },
    { area: "缓存", state: cacheMode(cache), detail: cache?.connected ? "跨请求与重启可复用" : cache?.local_memory || cache?.configured ? "进程内可复用，重启后清空" : "每次查询更依赖外部数据源" },
    { area: "Fuyao / HiThink", state: status.data?.fuyao?.api_key_configured ? "已配置" : "未配置", detail: status.data?.fuyao?.base_url || "优先金融数据源不可用时会回退" },
    { area: "Agent 工具", state: `${status.data?.agent?.tool_count ?? "-"} 个`, detail: "数据类回答应返回工具审计" },
  ];

  return <div className="page">
    <div className="page-title">
      <div><span className="eyebrow">DATA STATUS</span><h1>数据与运行状态</h1><p>开源自托管时用于确认后端、缓存、金融数据源和 Agent 工具是否就绪</p></div>
      <button className="icon-button" type="button" aria-label="刷新状态" title="刷新状态" onClick={() => { health.refetch(); status.refetch(); }}><RefreshCw size={17} aria-hidden="true" /></button>
    </div>

    {status.isLoading ? <Panel><Loading label="正在检查数据源状态" /></Panel> : status.error ? <Panel><ErrorState error={status.error} /></Panel> : <>
      <div className="metric-grid">
        <Metric label="后端服务" value={health.data ? "在线" : "离线"} />
        <Metric label="缓存模式" value={cacheMode(cache)} />
        <Metric label="Fuyao Key" value={yes(status.data?.fuyao?.api_key_configured)} />
        <Metric label="工具数量" value={status.data?.agent?.tool_count ?? "-"} />
      </div>
      <Panel title="运行检查">
        <DataTable rows={rows} columns={[
          { key: "area", label: "模块" },
          { key: "state", label: "状态", render: (value) => <span className={value === "离线" || value === "未配置" || value === "关闭" ? "badge warn" : "badge buy"}>{value}</span> },
          { key: "detail", label: "说明" },
        ]} />
      </Panel>
      <Panel title="开源部署提示">
        <div className="policy-list">
          <span>生产环境建议只公开前端入口，由 Nginx / Caddy / Cloudflare 代理 `/api`。</span>
          <span>LLM Key、Fuyao / HiThink Key 和 Redis 地址只放在后端环境变量，不进入浏览器。</span>
          <strong>数据仅供研究参考，不构成投资建议；公开 demo 应限流并避免上传真实账户记录。</strong>
        </div>
      </Panel>
    </>}
  </div>;
}
