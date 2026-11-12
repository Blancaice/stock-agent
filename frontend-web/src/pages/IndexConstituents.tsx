import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search, ZoomIn, ZoomOut } from "lucide-react";
import { api, unwrapItems, type JsonMap } from "../api";
import { Empty, ErrorState, Loading, Metric, Panel, buildDateWindow, dateText, fmt, pct, tone } from "../components";

const DEFAULT_QUERY = "机器人概念";
const RANGE_DAYS = 120;
const MIN_VISIBLE = 20;

type IndexItem = {
  thscode: string;
  ticker?: string;
  name?: string;
  exchange?: string;
  asset_type?: string;
};

type IndexBar = {
  date_ms: number;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
};

function normalizeHistory(rows: any[]): IndexBar[] {
  return rows.map((row) => ({
    date_ms: Number(row.date_ms ?? row.timestamp),
    open_price: Number(row.open_price ?? row.open),
    high_price: Number(row.high_price ?? row.high),
    low_price: Number(row.low_price ?? row.low),
    close_price: Number(row.close_price ?? row.close),
  })).filter((row) => Number.isFinite(row.date_ms) && Number.isFinite(row.close_price)).sort((a, b) => a.date_ms - b.date_ms);
}

function volatility20(rows: IndexBar[]) {
  const segment = rows.slice(-20);
  if (segment.length < 2) return null;
  const returns = segment.slice(1).map((row, index) => {
    const prev = segment[index].close_price;
    return prev ? (row.close_price - prev) / prev : 0;
  });
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * 100;
}

function IndexChart({ rows }: { rows: IndexBar[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ start: Math.max(0, rows.length - 60), end: rows.length });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const drag = useRef<{ x: number; view: { start: number; end: number } } | null>(null);

  useEffect(() => {
    setView({ start: Math.max(0, rows.length - 60), end: rows.length });
  }, [rows.length]);

  const visible = rows.slice(view.start, view.end);
  const hover = hoverIndex == null ? visible[visible.length - 1] : rows[hoverIndex];

  function updateView(next: { start: number; end: number }) {
    const width = next.end - next.start;
    const clampedWidth = Math.max(MIN_VISIBLE, Math.min(rows.length, width));
    const start = Math.max(0, Math.min(rows.length - clampedWidth, next.start));
    setView({ start, end: start + clampedWidth });
  }

  function zoom(factor: number) {
    const width = view.end - view.start;
    const nextWidth = Math.round(width * factor);
    const center = view.start + width / 2;
    updateView({ start: Math.round(center - nextWidth / 2), end: Math.round(center + nextWidth / 2) });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !visible.length) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const top = 18;
    const bottom = rect.height - 26;
    const left = 46;
    const right = rect.width - 16;
    const chartWidth = right - left;
    const prices = visible.flatMap((row) => [row.high_price, row.low_price]);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const pad = Math.max((maxPrice - minPrice) * 0.08, 0.01);
    const priceHeight = bottom - top;
    const y = (value: number) => top + ((maxPrice + pad - value) / (maxPrice - minPrice + pad * 2)) * priceHeight;
    const x = (index: number) => left + (index + 0.5) * (chartWidth / visible.length);
    const bar = Math.max(3, Math.min(13, chartWidth / visible.length * 0.58));

    ctx.strokeStyle = "#e2e7e4";
    ctx.fillStyle = "#73817b";
    ctx.font = "10px system-ui, sans-serif";
    for (let i = 0; i <= 4; i += 1) {
      const gy = top + (priceHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(left, gy);
      ctx.lineTo(right, gy);
      ctx.stroke();
      const label = maxPrice + pad - ((maxPrice - minPrice + pad * 2) / 4) * i;
      ctx.fillText(label.toFixed(2), 6, gy + 3);
    }

    visible.forEach((row, index) => {
      const cx = x(index);
      const up = row.close_price >= row.open_price;
      ctx.strokeStyle = up ? "#c4473a" : "#13795b";
      ctx.fillStyle = up ? "#c4473a" : "#13795b";
      ctx.beginPath();
      ctx.moveTo(cx, y(row.high_price));
      ctx.lineTo(cx, y(row.low_price));
      ctx.stroke();
      const openY = y(row.open_price);
      const closeY = y(row.close_price);
      const boxTop = Math.min(openY, closeY);
      const boxHeight = Math.max(1, Math.abs(closeY - openY));
      if (up) ctx.fillRect(cx - bar / 2, boxTop, bar, boxHeight);
      else ctx.strokeRect(cx - bar / 2, boxTop, bar, boxHeight);
    });

    if (hoverIndex != null && hoverIndex >= view.start && hoverIndex < view.end) {
      const local = hoverIndex - view.start;
      const cx = x(local);
      ctx.strokeStyle = "#2a3439";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [hoverIndex, rows.length, view, visible]);

  useEffect(() => {
    const onResize = () => setView((current) => ({ ...current }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function indexFromClientX(clientX: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !visible.length) return null;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - 46) / Math.max(1, rect.width - 62)));
    return Math.max(view.start, Math.min(view.end - 1, view.start + Math.floor(ratio * visible.length)));
  }

  return <Panel className="stock-chart-panel" title="概念指数 OHLC" action={<div className="chart-actions"><button className="icon-button" type="button" aria-label="放大图表" title="放大" onClick={() => zoom(0.75)}><ZoomIn size={16} aria-hidden="true" /></button><button className="icon-button" type="button" aria-label="缩小图表" title="缩小" onClick={() => zoom(1.25)}><ZoomOut size={16} aria-hidden="true" /></button></div>}>
    <div className="chart-toolbar" aria-label="指数窗口切换">
      {[20, 60, 120].map((size) => <button key={size} className={view.end - view.start === Math.min(size, rows.length) ? "active" : ""} onClick={() => updateView({ start: rows.length - size, end: rows.length })}>{size}日</button>)}
      <button className={view.start === 0 && view.end === rows.length ? "active" : ""} onClick={() => updateView({ start: 0, end: rows.length })}>全部</button>
      <span>滚轮缩放</span>
      <span>拖拽平移</span>
    </div>
    <div
      ref={wrapRef}
      className="stock-canvas-wrap"
      tabIndex={0}
      role="img"
      aria-label="概念指数 OHLC 图，可用鼠标滚轮缩放、拖拽平移，键盘左右键平移，加减键缩放"
      onWheel={(event) => { event.preventDefault(); zoom(event.deltaY < 0 ? 0.85 : 1.15); }}
      onMouseMove={(event) => {
        if (drag.current) {
          const dx = event.clientX - drag.current.x;
          const step = Math.round((-dx / Math.max(1, event.currentTarget.clientWidth - 62)) * (drag.current.view.end - drag.current.view.start));
          updateView({ start: drag.current.view.start + step, end: drag.current.view.end + step });
        }
        setHoverIndex(indexFromClientX(event.clientX));
      }}
      onMouseLeave={() => { setHoverIndex(null); drag.current = null; }}
      onMouseDown={(event) => { drag.current = { x: event.clientX, view }; }}
      onMouseUp={() => { drag.current = null; }}
      onKeyDown={(event) => {
        const width = view.end - view.start;
        if (event.key === "ArrowLeft") updateView({ start: view.start - 8, end: view.end - 8 });
        if (event.key === "ArrowRight") updateView({ start: view.start + 8, end: view.end + 8 });
        if (event.key === "+" || event.key === "=") zoom(0.85);
        if (event.key === "-" || event.key === "_") zoom(1.15);
        if (event.key === "Home") updateView({ start: 0, end: width });
        if (event.key === "End") updateView({ start: rows.length - width, end: rows.length });
      }}
    >
      <canvas ref={canvasRef} />
    </div>
    {hover && <div className="quote-strip">
      <span>{dateText(hover.date_ms)}</span>
      <span>开 {fmt.number(hover.open_price)}</span>
      <span>高 {fmt.number(hover.high_price)}</span>
      <span>低 {fmt.number(hover.low_price)}</span>
      <strong className={tone(pct(hover.open_price, hover.close_price))}>收 {fmt.number(hover.close_price)}</strong>
    </div>}
  </Panel>;
}

export function IndexConstituents() {
  const [queryText, setQueryText] = useState(DEFAULT_QUERY);
  const [submitted, setSubmitted] = useState(DEFAULT_QUERY);
  const [filterText, setFilterText] = useState("");
  const range = buildDateWindow(RANGE_DAYS);

  const listQuery = useQuery({
    queryKey: ["index-catalog"],
    queryFn: () => api.post<JsonMap>("/market/index/list", { tag: "cn_concept" }, 35_000),
  });

  const indexes = unwrapItems(listQuery.data) as IndexItem[];
  const selected = useMemo(() => {
    const exact = indexes.filter((item) => item.name === submitted || item.ticker === submitted || item.thscode === submitted.toUpperCase());
    if (exact.length === 1) return exact[0];
    if (indexes.length === 1) return indexes[0];
    return indexes.find((item) => (item.name || "").includes(submitted));
  }, [indexes, submitted]);

  const snapshotQuery = useQuery({
    queryKey: ["index-snapshot", selected?.thscode],
    enabled: Boolean(selected?.thscode),
    queryFn: () => api.post<JsonMap>("/market/index/snapshot", { thscodes: selected?.thscode }, 35_000),
  });

  const historyQuery = useQuery({
    queryKey: ["index-history", selected?.thscode, range.start, range.end],
    enabled: Boolean(selected?.thscode),
    queryFn: () => api.post<JsonMap>("/market/index/history", { thscode: selected?.thscode, start_date: range.start, end_date: range.end }, 45_000),
  });

  const constituentsQuery = useQuery({
    queryKey: ["index-constituents", selected?.thscode],
    enabled: Boolean(selected?.thscode),
    queryFn: () => api.post<JsonMap>("/market/index/constituents", { thscode: selected?.thscode }, 35_000),
  });

  const snapshot = unwrapItems(snapshotQuery.data)[0] || {};
  const history = normalizeHistory(unwrapItems(historyQuery.data));
  const latest = history[history.length - 1];
  const first = history[0];
  const changePct = pct(first?.close_price, latest?.close_price);
  const vol20 = volatility20(history);
  const constituents = (unwrapItems(constituentsQuery.data) as IndexItem[]).filter((item) => {
    const query = filterText.trim().toLowerCase();
    return !query || (item.name || "").toLowerCase().includes(query) || item.thscode.toLowerCase().includes(query) || (item.ticker || "").includes(query);
  });
  const visibleConstituents = constituents.slice(0, 15);
  const loading = listQuery.isLoading || snapshotQuery.isLoading || historyQuery.isLoading || constituentsQuery.isLoading;
  const error = listQuery.error || snapshotQuery.error || historyQuery.error || constituentsQuery.error;

  return <div className="page stock-page">
    <div className="page-title"><div><span className="eyebrow">CONCEPT LINKAGE</span><h1>概念板块联动</h1><p>概念指数走势与当前成分股放在同一页，明确联动边界</p></div><button className="icon-button" type="button" aria-label="刷新数据" title="刷新数据" onClick={() => { listQuery.refetch(); snapshotQuery.refetch(); historyQuery.refetch(); constituentsQuery.refetch(); }}><RefreshCw size={17} aria-hidden="true" /></button></div>
    <div className="toolbar">
      <label className="search-field"><span className="sr-only">概念名称或代码</span><Search size={16} aria-hidden="true" /><input value={queryText} name="concept_query" autoComplete="off" onChange={(event) => setQueryText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setSubmitted(queryText.trim() || DEFAULT_QUERY); }} placeholder="输入概念名称、代码或 thscode…" /></label>
      <button className="primary" type="button" onClick={() => setSubmitted(queryText.trim() || DEFAULT_QUERY)}>查询</button>
    </div>

    {!selected && listQuery.data && <Panel><Empty>概念未唯一匹配，请输入更准确的名称或代码</Empty></Panel>}
    {error ? <ErrorState error={error} /> : loading ? <Loading label="正在读取概念指数与成分股数据" /> : selected && history.length ? <>
      <Panel className="concept-header-strip">
        <div className="concept-strip-main">
          <div><span className="concept-kicker">{selected.name || submitted}</span><h2>{selected.thscode}</h2><p>同花顺概念指数</p></div>
          <div className="concept-strip-price"><strong className={tone(snapshot.price_change_ratio_pct ?? changePct)}>{fmt.number(snapshot.last_price ?? latest.close_price)}</strong><span className={tone(snapshot.price_change_ratio_pct ?? changePct)}>{fmt.percent(snapshot.price_change_ratio_pct ?? changePct)}</span></div>
        </div>
        <div className="concept-strip-stats">
          <div><span>区间涨跌</span><strong className={tone(changePct)}>{fmt.percent(changePct)}</strong></div>
          <div><span>20日波动</span><strong>{fmt.percent(vol20)}</strong></div>
          <div><span>当前成分</span><strong>{constituents.length}</strong></div>
          <div><span>数据区间</span><strong>{dateText(first.date_ms)} 至 {dateText(latest.date_ms)}</strong></div>
        </div>
      </Panel>

      <section className="concept-ribbon">
        <div className="concept-chart-pane">
          <IndexChart rows={history} />
        </div>

        <Panel className="concept-constituent-panel" title="成分股摘要" action={<label className="search-field inline-search"><span className="sr-only">筛选成分股</span><Search size={14} aria-hidden="true" /><input value={filterText} name="constituent_filter" autoComplete="off" onChange={(event) => setFilterText(event.target.value)} placeholder="搜索名称或代码…" /></label>}>
          {visibleConstituents.length ? <div className="constituent-grid compact-grid">{visibleConstituents.map((row) => <article key={row.thscode} className="constituent-card"><span>{row.thscode}</span><strong>{row.name || "-"}</strong><small>{row.exchange || "-"} · {row.asset_type || "-"}</small></article>)}</div> : <Empty>当前筛选下没有成分股</Empty>}
          <div className="summary-text">只展示前 15 个成分摘要，不在页面展开完整列表。</div>
        </Panel>
      </section>

      <Panel title="联动边界">
        <div className="summary-text">当前成分不代表历史成分。指数涨跌不证明单只股票的概念相关度，下方成分列表仅用于观察当前横截面，不应用来反推历史指数贡献。</div>
      </Panel>

      <div className="stock-footnote">
        <span>指数代码：{selected.thscode}</span>
        <span>数据日期：{dateText(latest.date_ms)}</span>
        <span>接入方式：A-Research FastAPI -&gt; Fuyao / HiThink REST API</span>
        <span>数据源：Fuyao / HiThink REST API</span>
        <span>指数口径：1d OHLC，无复权概念</span>
        <strong>非投资建议</strong>
      </div>
    </> : null}
  </div>;
}
