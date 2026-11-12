import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Flame, RefreshCw } from "lucide-react";
import { api, unwrapItems, type JsonMap } from "../api";
import { Empty, ErrorState, Loading, Metric, Panel, fmt, tone } from "../components";

const TREND_START = "2026-06-24";
const TREND_END = "2026-07-24";

type RankRow = {
  thscode: string;
  ticker?: string;
  name?: string;
  rank?: number;
  heat?: string | number;
  rank_change?: number;
  rank_trend?: string;
};

type TrendPoint = {
  date_ms: number;
  rank: number;
};

const viewOptions = [
  { board: "hot", period: "day", label: "热股 24 小时" },
  { board: "hot", period: "hour", label: "热股 小时" },
  { board: "sky", period: "day", label: "飙升 24 小时" },
  { board: "sky", period: "hour", label: "飙升 小时" },
] as const;

function number(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function heatText(value: any) {
  const parsed = number(value);
  return parsed == null ? "-" : parsed.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

function TrendChart({ series }: { series: { name: string; thscode: string; points: TrendPoint[] }[] }) {
  const all = series.flatMap((item) => item.points);
  if (!all.length) return <Empty>暂无排名趋势</Empty>;
  const width = 760;
  const height = 260;
  const top = 18;
  const left = 36;
  const bottom = height - 24;
  const right = width - 14;
  const minDate = Math.min(...all.map((point) => point.date_ms));
  const maxDate = Math.max(...all.map((point) => point.date_ms));
  const maxRank = Math.max(...all.map((point) => point.rank), 30);
  const x = (value: number) => left + ((value - minDate) / Math.max(1, maxDate - minDate)) * (right - left);
  const y = (value: number) => top + ((value - 1) / Math.max(1, maxRank - 1)) * (bottom - top);
  const colors = ["#c4473a", "#2f6fa9", "#a96a16"];
  return <div className="index-line-wrap">
    <svg viewBox={`0 0 ${width} ${height}`} className="index-line" role="img" aria-label="近 30 日热榜排名轨迹">
      {[1, 10, 20, 30].map((tick) => <g key={tick}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="#e2e7e4" /><text x="4" y={y(tick) + 4} fontSize="10" fill="#6d7974">#{tick}</text></g>)}
      {series.map((item, index) => {
        const d = item.points.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${x(point.date_ms)},${y(point.rank)}`).join(" ");
        return <path key={item.thscode} d={d} fill="none" stroke={colors[index % colors.length]} strokeWidth="2.2" />;
      })}
    </svg>
    <div className="quote-strip">
      {series.map((item, index) => <span key={item.thscode}><i className={`trend-dot trend-${index + 1}`} />{item.name} {item.points.at(-1)?.rank ? `#${item.points.at(-1)?.rank}` : ""}</span>)}
    </div>
  </div>;
}

export function HeatRadar() {
  const [view, setView] = useState<(typeof viewOptions)[number]>(viewOptions[0]);
  const hotDayQuery = useQuery({ queryKey: ["hot-stock", "day"], queryFn: () => api.post<JsonMap>("/market/a-share/hot-stock", { period: "day" }, 35_000) });
  const hotHourQuery = useQuery({ queryKey: ["hot-stock", "hour"], queryFn: () => api.post<JsonMap>("/market/a-share/hot-stock", { period: "hour" }, 35_000) });
  const skyDayQuery = useQuery({ queryKey: ["skyrocket", "day"], queryFn: () => api.post<JsonMap>("/market/a-share/skyrocket", { period: "day" }, 35_000) });
  const skyHourQuery = useQuery({ queryKey: ["skyrocket", "hour"], queryFn: () => api.post<JsonMap>("/market/a-share/skyrocket", { period: "hour" }, 35_000) });

  const hotDayRows = unwrapItems(hotDayQuery.data) as RankRow[];
  const hotHourRows = unwrapItems(hotHourQuery.data) as RankRow[];
  const skyDayRows = unwrapItems(skyDayQuery.data) as RankRow[];
  const skyHourRows = unwrapItems(skyHourQuery.data) as RankRow[];
  const overlap = useMemo(() => {
    const skyCodes = new Set(skyDayRows.map((row) => row.thscode));
    return hotDayRows.filter((row) => skyCodes.has(row.thscode)).length;
  }, [hotDayRows, skyDayRows]);

  const trendTargets = hotDayRows.slice(0, 3);
  const trendQueries = useQueries({
    queries: trendTargets.map((row) => ({
      queryKey: ["hot-stock-trend", row.thscode],
      enabled: Boolean(row.thscode),
      queryFn: () => api.post<JsonMap>("/market/a-share/hot-stock-trend", { thscode: row.thscode, start_date: TREND_START, end_date: TREND_END }, 45_000),
    })),
  });

  const trendSeries = trendTargets.map((row, index) => ({
    thscode: row.thscode,
    name: row.name || row.thscode,
    points: unwrapItems(trendQueries[index]?.data).map((point) => ({ date_ms: Number(point.date_ms), rank: Number(point.rank) })).filter((point) => Number.isFinite(point.date_ms) && Number.isFinite(point.rank)).sort((a, b) => a.date_ms - b.date_ms),
  })).filter((item) => item.points.length);

  const datasets = {
    "hot-day": hotDayRows,
    "hot-hour": hotHourRows,
    "sky-day": skyDayRows,
    "sky-hour": skyHourRows,
  } as const;

  const currentRows = datasets[`${view.board}-${view.period}` as keyof typeof datasets] || [];
  const topHeat = currentRows.length ? heatText(currentRows[0].heat) : "-";
  const risingCount = currentRows.filter((row) => number(row.rank_change) != null && Number(row.rank_change) > 0).length;
  const loading = hotDayQuery.isLoading || hotHourQuery.isLoading || skyDayQuery.isLoading || skyHourQuery.isLoading || trendQueries.some((query) => query.isLoading);
  const error = hotDayQuery.error || hotHourQuery.error || skyDayQuery.error || skyHourQuery.error || trendQueries.map((query) => query.error).find(Boolean);

  return <div className="page stock-page">
    <div className="page-title"><div><span className="eyebrow">HEAT RADAR</span><h1>市场热度与飙升雷达</h1><p>热股榜、飙升榜和代表股票近 30 日排名轨迹同页观察</p></div><button className="icon-button" type="button" aria-label="刷新数据" title="刷新数据" onClick={() => { hotDayQuery.refetch(); hotHourQuery.refetch(); skyDayQuery.refetch(); skyHourQuery.refetch(); trendQueries.forEach((query) => query.refetch()); }}><RefreshCw size={17} aria-hidden="true" /></button></div>
    <div className="segmented stock-tabs" role="tablist" aria-label="榜单视图切换">
      {viewOptions.map((option) => <button key={`${option.board}-${option.period}`} className={view.board === option.board && view.period === option.period ? "active" : ""} onClick={() => setView(option)}>{option.label}</button>)}
    </div>
    {error ? <ErrorState error={error} /> : loading ? <Loading label="正在读取热股榜、飙升榜和趋势轨迹" /> : <>
      <Panel className="concept-header-strip">
        <div className="concept-strip-main">
          <div><span className="concept-kicker">{view.label}</span><h2>{view.board === "hot" ? "热股榜" : "飙升榜"}</h2><p>热股与飙升含义不同，不合成为单一评分</p></div>
          <div className="concept-strip-price"><strong>{topHeat}</strong><span>Top1 热度</span></div>
        </div>
        <div className="concept-strip-stats">
          <div><span>热股/飙升重合</span><strong>{overlap}</strong></div>
          <div><span>排名上升数量</span><strong>{risingCount}</strong></div>
          <div><span>代表轨迹</span><strong>{trendSeries.length}</strong></div>
          <div><span>趋势窗口</span><strong>{TREND_START} 至 {TREND_END}</strong></div>
        </div>
      </Panel>

      <section className="concept-ribbon">
        <div className="concept-chart-pane">
          <Panel title="热股日榜前 3 名近 30 日轨迹" action={<span className="data-note">排名图为原始名次轨迹，不能解释为确定性买卖信号</span>}>
            <TrendChart series={trendSeries} />
          </Panel>
        </div>
        <Panel className="concept-constituent-panel" title="当前榜单摘要" action={<span className="data-note">{view.period === "day" ? "24 小时榜" : "小时榜"}</span>}>
          {currentRows.length ? <div className="constituent-grid compact-grid">{currentRows.slice(0, 15).map((row) => <article key={row.thscode} className="constituent-card"><span>#{row.rank} · {row.thscode}</span><strong>{row.name || "-"}</strong><small>热度 {heatText(row.heat)} · 变化 {number(row.rank_change) ?? "-"}</small></article>)}</div> : <Empty>当前视图暂无榜单数据</Empty>}
          <div className="summary-text">页面只展示前 15 个摘要项。榜单完整响应和趋势原始序列已落到临时文件，不在页面展开。</div>
        </Panel>
      </section>

      <Panel title="数据边界">
        <div className="summary-text">热股榜与飙升榜统计口径不同。这里比较的是榜单重合度、热度、排名变化和趋势方向，不把它们混成单一评分，也不把排名变化解释成确定性买卖信号。</div>
      </Panel>

      <div className="stock-footnote">
        <span>榜单时间：{view.period === "day" ? "24 小时" : "小时"}</span>
        <span>数据源：hithink-finance CLI / Fuyao / HiThink</span>
        <span>接入方式：FastAPI -&gt; REST API</span>
        <span>数据延迟边界：榜单为时点快照，趋势窗口为近 30 日</span>
        <strong>非投资建议</strong>
      </div>
    </>}
  </div>;
}
