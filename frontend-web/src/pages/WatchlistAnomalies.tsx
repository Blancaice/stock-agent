import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { api, unwrapItems, type JsonMap } from "../api";
import { Empty, ErrorState, Loading, Metric, Panel, fmt, moneyYi, tone } from "../components";

const DEFAULT_NAMES = "同花顺, 贵州茅台, 平安银行";

type WatchRow = {
  thscode: string;
  name: string;
  ticker?: string;
  last_price?: number;
  price_change_ratio_pct?: number;
  high_price?: number;
  low_price?: number;
  turnover?: number;
  anomaly?: string;
};

function normalizeInput(value: string) {
  return Array.from(new Set(value.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean))).slice(0, 20);
}

function anomalyText(records: any[]) {
  if (!records.length) return "";
  return records.map((record) => record.reason || record.anomaly_reason || record.tag_name || record.event || record.description || record.title).filter(Boolean).join("；");
}

async function fetchWatchlist(names: string[]) {
  const resolved = await Promise.all(names.map(async (name) => {
    const data = await api.post<JsonMap>("/market/tickers/search", { keyword: name, asset_type: "a-share", limit: 10 }, 25_000);
    const items = unwrapItems(data).filter((item) => item.asset_type === "a-share");
    const exact = items.filter((item) => item.name === name || item.ticker === name || item.thscode === name.toUpperCase());
    const selected = exact.length === 1 ? exact[0] : items.length === 1 ? items[0] : null;
    return selected ? { thscode: selected.thscode, name: selected.name || name, ticker: selected.ticker } : { error: `${name} 未能唯一消歧` };
  }));
  const failures = resolved.filter((item: any) => item.error).map((item: any) => item.error);
  const symbols = Array.from(new Map(resolved.filter((item: any) => item.thscode).map((item: any) => [item.thscode, item])).values()) as WatchRow[];
  if (!symbols.length) return { rows: [], failures, timestamp: Date.now() };
  const thscodes = symbols.map((item) => item.thscode).join(",");
  const [snapshot, anomaly] = await Promise.all([
    api.post<JsonMap>("/market/a-share/snapshot", { thscodes }, 35_000),
    api.post<JsonMap>("/market/a-share/anomaly-analysis-stock", { thscodes }, 35_000).catch((error) => ({ error: error instanceof Error ? error.message : "异动接口请求失败" })),
  ]);
  const snapshotMap = new Map(unwrapItems(snapshot).map((item) => [item.thscode, item]));
  const anomalyRows = unwrapItems(anomaly as JsonMap);
  const anomalyMap = new Map<string, any[]>();
  anomalyRows.forEach((item) => {
    const key = item.thscode || item.stock_code || item.code;
    if (!key) return;
    anomalyMap.set(key, [...(anomalyMap.get(key) || []), item]);
  });
  return {
    rows: symbols.map((symbol) => {
      const quote = snapshotMap.get(symbol.thscode) || {};
      const records = anomalyMap.get(symbol.thscode) || [];
      return {
        ...symbol,
        last_price: Number(quote.last_price),
        price_change_ratio_pct: Number(quote.price_change_ratio_pct),
        high_price: Number(quote.high_price),
        low_price: Number(quote.low_price),
        turnover: Number(quote.turnover),
        anomaly: anomalyText(records),
      };
    }),
    failures,
    anomalyError: (anomaly as JsonMap).error,
    timestamp: Number(snapshot.timestamp || Date.now()),
  };
}

function timeText(ms: number) {
  return new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function WatchlistAnomalies() {
  const [names, setNames] = useState(() => localStorage.getItem("stock-watchlist") || DEFAULT_NAMES);
  const [submitted, setSubmitted] = useState(names);
  // 后端是 source of truth；localStorage 仅作本地缓存，让首屏即时渲染并在后端断线时兜底。
  useEffect(() => {
    let cancelled = false;
    api.get<{ codes?: string[] }>(`/user/watchlist/stock`, 8_000).then((data) => {
      if (cancelled || !data?.codes) return;
      const joined = data.codes.join(",");
      if (!joined) return;
      localStorage.setItem("stock-watchlist", joined);
      setNames(joined);
      setSubmitted(joined);
    }).catch(() => { /* 后端断线时沿用本地缓存，不阻塞页面 */ });
    return () => { cancelled = true; };
  }, []);
  const [sortBy, setSortBy] = useState<"change" | "turnover">("change");
  const [keyword, setKeyword] = useState("");
  const [onlyAnomaly, setOnlyAnomaly] = useState(false);
  const parsed = useMemo(() => normalizeInput(submitted), [submitted]);
  const query = useQuery({
    queryKey: ["watchlist-anomalies", parsed.join(",")],
    queryFn: () => fetchWatchlist(parsed),
    enabled: parsed.length > 0,
  });
  const rows = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    return [...(query.data?.rows || [])]
      .filter((row) => !onlyAnomaly || Boolean(row.anomaly))
      .filter((row) => !search || row.name.toLowerCase().includes(search) || row.thscode.toLowerCase().includes(search) || row.ticker?.includes(search))
      .sort((a, b) => Number(b[sortBy === "change" ? "price_change_ratio_pct" : "turnover"]) - Number(a[sortBy === "change" ? "price_change_ratio_pct" : "turnover"]));
  }, [query.data?.rows, keyword, onlyAnomaly, sortBy]);
  const anomalyCount = (query.data?.rows || []).filter((row) => row.anomaly).length;

  function applyWatchlist() {
    const parsed = normalizeInput(names);
    localStorage.setItem("stock-watchlist", names);
    api.put(`/user/watchlist/stock`, { codes: parsed }, 8_000).catch(() => { /* 写失败仍保留本地缓存，下次启动重试 */ });
    setSubmitted(names);
  }

  return <div className="page">
    <div className="page-title"><div><span className="eyebrow">A-SHARE WATCHLIST</span><h1>自选股当日异动监控</h1><p>自选股消歧、批量快照和 today-only 异动原因</p></div><button className="icon-button" type="button" aria-label="刷新数据" title="刷新数据" onClick={() => query.refetch()}><RefreshCw size={17} aria-hidden="true" /></button></div>
    <div className="toolbar">
      <label className="search-field"><span className="sr-only">自选股票名称或代码</span><Search size={16} aria-hidden="true" /><input value={names} name="stock_names" autoComplete="off" onChange={(event) => setNames(event.target.value)} placeholder="输入股票名称或代码，以逗号分隔…" /></label>
      <button className="primary" type="button" onClick={applyWatchlist}>更新自选</button>
      <label><span>排序</span><select value={sortBy} name="sort_by" onChange={(event) => setSortBy(event.target.value as "change" | "turnover")}><option value="change">涨跌幅</option><option value="turnover">成交额</option></select></label>
      <label className="toggle"><input type="checkbox" checked={onlyAnomaly} onChange={(event) => setOnlyAnomaly(event.target.checked)} /><span />仅看异动</label>
    </div>
    <div className="toolbar compact-filter"><label className="search-field"><span className="sr-only">筛选自选明细</span><Search size={16} aria-hidden="true" /><input value={keyword} name="watchlist_filter" autoComplete="off" onChange={(event) => setKeyword(event.target.value)} placeholder="搜索名称或代码…" /></label></div>
    <div className="metric-grid">
      <Metric label="自选股票" value={query.data?.rows.length ?? "-"} detail={`输入 ${parsed.length} 个标的`} />
      <Metric label="异动匹配" value={query.data ? anomalyCount : "-"} detail="未返回不代表无事件" tone={anomalyCount ? "up" : "neutral"} />
      <Metric label="展示数量" value={rows.length || "-"} detail={onlyAnomaly ? "已过滤" : "全部可见"} />
      <Metric label="行情时间" value={query.data ? timeText(query.data.timestamp).slice(5, 16) : "-"} detail="Fuyao / HiThink" />
    </div>
    <Panel title="自选明细" action={<span className="data-note">异动接口为当日能力，空结果只表示接口未返回匹配记录</span>}>
      {query.isLoading ? <Loading label="正在读取自选股行情和异动原因" /> : query.error ? <ErrorState error={query.error} /> : rows.length ? <div className="table-wrap"><table><thead><tr><th>标的</th><th>最新价</th><th>涨跌幅</th><th>日内区间</th><th>成交额</th><th>异动原因</th></tr></thead><tbody>{rows.map((row) => <tr key={row.thscode}><td><div className="fund-name"><strong>{row.name}</strong><small>{row.thscode}</small></div></td><td>{fmt.number(row.last_price)}</td><td className={tone(row.price_change_ratio_pct)}>{fmt.percent(row.price_change_ratio_pct)}</td><td>{fmt.number(row.low_price)} - {fmt.number(row.high_price)}</td><td>{moneyYi(row.turnover)}</td><td className="reason-cell">{row.anomaly || "当日异动接口未返回匹配记录"}</td></tr>)}</tbody></table></div> : <Empty>暂无可展示自选股</Empty>}
    </Panel>
    {(query.data?.failures.length || query.data?.anomalyError) && <Panel title="数据边界"><div className="summary-text">{[...(query.data?.failures || []), query.data?.anomalyError ? `异动接口：${query.data.anomalyError}` : ""].filter(Boolean).join("；")}</div></Panel>}
    <div className="stock-footnote"><span>数据源：Fuyao / HiThink REST API</span><span>异动范围：today-only</span><span>最多 20 只 A 股</span><strong>非投资建议</strong></div>
  </div>;
}
