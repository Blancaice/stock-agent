import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, FileText, RefreshCw, Search, ZoomIn, ZoomOut } from "lucide-react";
import { api, unwrapItems, type JsonMap } from "../api";
import { Empty, ErrorState, Loading, Metric, Panel, buildDateWindow, dateText, fmt, moneyYi, pct, tone } from "../components";

type SymbolItem = {
  thscode: string;
  ticker?: string;
  name?: string;
  exchange?: string;
  asset_type?: string;
};

type KLine = {
  date_ms: number;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume?: number;
  turnover?: number;
  ma20?: number | null;
  ma60?: number | null;
  ma120?: number | null;
};

type FinanceRow = {
  period_end_ms: number;
  report_date_ms?: number;
  fiscal_year?: number;
  fiscal_period?: string;
  currency?: string;
  operating_income?: number | null;
  net_profit?: number | null;
  parent_holder_net_profit?: number | null;
  basic_eps?: number | null;
  assets_total?: number | null;
  cash?: number | null;
  total_debt?: number | null;
  holder_equity_total?: number | null;
  act_cash_flow_net?: number | null;
  pay_fixed_assets_etc_cash?: number | null;
};

const DEFAULT_QUERY = "同花顺";
const RANGE_DAYS = 380;
const MIN_VISIBLE = 35;

function movingAverage(rows: KLine[], window: number, index: number) {
  if (index + 1 < window) return null;
  let sum = 0;
  for (let i = index - window + 1; i <= index; i += 1) sum += rows[i].close_price;
  return sum / window;
}

function normalizeRows(rawRows: any[]): KLine[] {
  return rawRows
    .map((row) => ({
      date_ms: Number(row.date_ms ?? row.timestamp ?? row.date),
      open_price: Number(row.open_price ?? row.open),
      high_price: Number(row.high_price ?? row.high),
      low_price: Number(row.low_price ?? row.low),
      close_price: Number(row.close_price ?? row.close),
      volume: Number(row.volume),
      turnover: Number(row.turnover ?? row.amount),
    }))
    .filter((row) => Number.isFinite(row.date_ms) && Number.isFinite(row.close_price))
    .sort((a, b) => a.date_ms - b.date_ms)
    .map((row, index, rows) => ({
      ...row,
      ma20: movingAverage(rows, 20, index),
      ma60: movingAverage(rows, 60, index),
      ma120: movingAverage(rows, 120, index),
    }));
}

function maxDrawdown(rows: KLine[]) {
  let peak = -Infinity;
  let max = 0;
  for (const row of rows) {
    peak = Math.max(peak, row.close_price);
    if (peak > 0) max = Math.min(max, (row.close_price - peak) / peak);
  }
  return max * 100;
}

function avgTurnover(rows: KLine[]) {
  const values = rows.map((row) => Number(row.turnover)).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(numerator: any, denominator: any) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return (n / d) * 100;
}

function pickNumber(row: any, key: string) {
  const value = Number(row?.[key]);
  return Number.isFinite(value) ? value : null;
}

function mergeFinancials(incomeRows: any[], balanceRows: any[], cashRows: any[]): FinanceRow[] {
  const map = new Map<number, FinanceRow>();
  const ensure = (row: any) => {
    const key = Number(row.period_end_ms);
    if (!Number.isFinite(key)) return null;
    if (!map.has(key)) {
      map.set(key, {
        period_end_ms: key,
        report_date_ms: Number(row.report_date_ms) || undefined,
        fiscal_year: row.fiscal_year,
        fiscal_period: row.fiscal_period,
        currency: row.currency,
      });
    }
    return map.get(key)!;
  };
  incomeRows.forEach((row) => {
    const target = ensure(row);
    if (!target) return;
    target.operating_income = pickNumber(row, "operating_income");
    target.net_profit = pickNumber(row, "net_profit");
    target.parent_holder_net_profit = pickNumber(row, "parent_holder_net_profit");
    target.basic_eps = pickNumber(row, "basic_eps");
  });
  balanceRows.forEach((row) => {
    const target = ensure(row);
    if (!target) return;
    target.assets_total = pickNumber(row, "assets_total");
    target.cash = pickNumber(row, "cash");
    target.total_debt = pickNumber(row, "total_debt");
    target.holder_equity_total = pickNumber(row, "holder_equity_total");
  });
  cashRows.forEach((row) => {
    const target = ensure(row);
    if (!target) return;
    target.act_cash_flow_net = pickNumber(row, "act_cash_flow_net");
    target.pay_fixed_assets_etc_cash = pickNumber(row, "pay_fixed_assets_etc_cash");
  });
  return Array.from(map.values()).sort((a, b) => a.period_end_ms - b.period_end_ms);
}

function periodLabel(row: FinanceRow) {
  return row.fiscal_year && row.fiscal_period ? `${row.fiscal_year}${row.fiscal_period}` : dateText(row.period_end_ms);
}

function FinancialBars({ rows, metric }: { rows: FinanceRow[]; metric: keyof FinanceRow }) {
  const values = rows.map((row) => Number(row[metric])).filter(Number.isFinite);
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  return <div className="finance-bars" role="img" aria-label="季度财务序列">
    {rows.map((row) => {
      const value = Number(row[metric]);
      const height = Number.isFinite(value) ? Math.max(4, Math.abs(value) / max * 100) : 0;
      return <button key={row.period_end_ms} title={`${periodLabel(row)} ${moneyYi(value)}`} className={value >= 0 ? "positive" : "negative"}>
        <i style={{ height: `${height}%` }} /><span>{row.fiscal_period || "-"}</span>
      </button>;
    })}
  </div>;
}

function FinancialHealth({ selected }: { selected: SymbolItem }) {
  const [metric, setMetric] = useState<keyof FinanceRow>("operating_income");
  const incomeQuery = useQuery({
    queryKey: ["stock-income", selected.thscode],
    queryFn: () => api.post<JsonMap>("/market/a-share/financials", { thscode: selected.thscode, statement: "income", period: "quarterly", limit: 8 }, 45_000),
  });
  const balanceQuery = useQuery({
    queryKey: ["stock-balance", selected.thscode],
    queryFn: () => api.post<JsonMap>("/market/a-share/financials", { thscode: selected.thscode, statement: "balance", period: "quarterly", limit: 8 }, 45_000),
  });
  const cashQuery = useQuery({
    queryKey: ["stock-cash", selected.thscode],
    queryFn: () => api.post<JsonMap>("/market/a-share/financials", { thscode: selected.thscode, statement: "cashflow", period: "quarterly", limit: 8 }, 45_000),
  });
  const rows = useMemo(() => mergeFinancials(unwrapItems(incomeQuery.data), unwrapItems(balanceQuery.data), unwrapItems(cashQuery.data)), [incomeQuery.data, balanceQuery.data, cashQuery.data]);
  const latest = rows[rows.length - 1];
  const previousYear = rows.find((row) => row.fiscal_period === latest?.fiscal_period && row.fiscal_year === Number(latest?.fiscal_year) - 1);
  const loading = incomeQuery.isLoading || balanceQuery.isLoading || cashQuery.isLoading;
  const error = incomeQuery.error || balanceQuery.error || cashQuery.error;
  if (error) return <ErrorState error={error} />;
  if (loading) return <Loading label="正在读取最近 8 期季度财报" />;
  if (!latest) return <Panel><Empty>财报接口暂无可展示数据</Empty></Panel>;

  const incomeYoy = pct(previousYear?.operating_income ?? undefined, latest.operating_income ?? undefined);
  const profitYoy = pct(previousYear?.net_profit ?? undefined, latest.net_profit ?? undefined);
  const cashConversion = ratio(latest.act_cash_flow_net, latest.net_profit);
  const debtAssets = ratio(latest.total_debt, latest.assets_total);
  const fieldCount = [
    latest.operating_income,
    latest.net_profit,
    latest.act_cash_flow_net,
    latest.assets_total,
    latest.cash,
    latest.total_debt,
  ].filter((value) => value != null).length;

  return <>
    <div className="metric-grid stock-metrics">
      <Metric label="营业收入同比" value={fmt.percent(incomeYoy)} detail={moneyYi(latest.operating_income)} tone={tone(incomeYoy)} />
      <Metric label="净利润同比" value={fmt.percent(profitYoy)} detail={moneyYi(latest.net_profit)} tone={tone(profitYoy)} />
      <Metric label="经营现金转化" value={fmt.percent(cashConversion)} detail={moneyYi(latest.act_cash_flow_net)} tone={tone(cashConversion)} />
      <Metric label="有息负债/资产" value={fmt.percent(debtAssets)} detail={`字段完整度 ${fieldCount}/6`} />
    </div>
    <Panel title="季度财务序列" action={<div className="chart-toolbar compact-toolbar">
      <button className={metric === "operating_income" ? "active" : ""} onClick={() => setMetric("operating_income")}>收入</button>
      <button className={metric === "net_profit" ? "active" : ""} onClick={() => setMetric("net_profit")}>利润</button>
      <button className={metric === "act_cash_flow_net" ? "active" : ""} onClick={() => setMetric("act_cash_flow_net")}>现金流</button>
    </div>}>
      <FinancialBars rows={rows} metric={metric} />
      <div className="finance-brief">
        <div><span>最新报告期</span><strong>{periodLabel(latest)}</strong><small>披露日 {latest.report_date_ms ? dateText(latest.report_date_ms) : "-"}</small></div>
        <p>财务体检只使用三张报表已返回字段，按 `period_end_ms` 对齐；缺失字段保持空值，不补零，不生成估值、行业均值或买卖评分。</p>
      </div>
    </Panel>
  </>;
}

const inspirationCards = [
  { title: "单股财务体检", status: "已接入", detail: "三张季度报表按报告期对齐，展示增长、现金流和杠杆证据。", icon: FileText },
  { title: "自选股当日异动监控", status: "已接入", detail: "独立自选异动页已支持批量快照、today-only 异动原因、排序和筛选。", icon: Activity },
  { title: "概念板块联动", status: "可接后续页", detail: "已有指数目录、成分和快照接口，可继续补指数历史端点与成分联动。", icon: BarChart3 },
  { title: "热度与龙虎榜观察", status: "后续模块", detail: "适合做短线情绪工作台，必须标明 today-only、榜单口径和非投资建议。", icon: ZoomIn },
];

function InspirationRoadmap() {
  return <div className="inspiration-grid">
    {inspirationCards.map((card) => {
      const Icon = card.icon;
      return <Panel key={card.title} className="inspiration-card">
        <div className="inspiration-head"><Icon size={18} /><span>{card.status}</span></div>
        <h2>{card.title}</h2>
        <p>{card.detail}</p>
      </Panel>;
    })}
  </div>;
}

function StockChart({ rows }: { rows: KLine[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ start: Math.max(0, rows.length - 120), end: rows.length });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const drag = useRef<{ x: number; view: { start: number; end: number } } | null>(null);

  useEffect(() => {
    setView({ start: Math.max(0, rows.length - 120), end: rows.length });
  }, [rows.length]);

  const visible = rows.slice(view.start, view.end);
  const hover = hoverIndex == null ? visible[visible.length - 1] : rows[hoverIndex];

  function updateView(next: { start: number; end: number }) {
    const width = next.end - next.start;
    const clampedWidth = Math.max(MIN_VISIBLE, Math.min(rows.length, width));
    let start = Math.max(0, Math.min(rows.length - clampedWidth, next.start));
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

    const priceTop = 18;
    const priceHeight = Math.round(rect.height * 0.72);
    const volTop = priceTop + priceHeight + 18;
    const volHeight = rect.height - volTop - 22;
    const left = 46;
    const right = rect.width - 16;
    const chartWidth = right - left;
    const prices = visible.flatMap((row) => [row.high_price, row.low_price, row.ma20, row.ma60, row.ma120].filter((v): v is number => Number.isFinite(Number(v))));
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const pad = Math.max((maxPrice - minPrice) * 0.08, 0.01);
    const y = (value: number) => priceTop + ((maxPrice + pad - value) / (maxPrice - minPrice + pad * 2)) * priceHeight;
    const x = (index: number) => left + (index + 0.5) * (chartWidth / visible.length);
    const bar = Math.max(3, Math.min(14, chartWidth / visible.length * 0.58));
    const maxVol = Math.max(...visible.map((row) => Number(row.volume) || 0), 1);

    ctx.strokeStyle = "#e2e7e4";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#7a8781";
    ctx.font = "10px system-ui, sans-serif";
    for (let i = 0; i <= 4; i += 1) {
      const gy = priceTop + (priceHeight / 4) * i;
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
      const top = Math.min(openY, closeY);
      const height = Math.max(1, Math.abs(closeY - openY));
      if (up) {
        ctx.fillRect(cx - bar / 2, top, bar, height);
      } else {
        ctx.strokeRect(cx - bar / 2, top, bar, height);
      }
      const vh = ((Number(row.volume) || 0) / maxVol) * volHeight;
      ctx.globalAlpha = 0.32;
      ctx.fillRect(cx - bar / 2, volTop + volHeight - vh, bar, vh);
      ctx.globalAlpha = 1;
    });

    const drawLine = (key: "ma20" | "ma60" | "ma120", color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      visible.forEach((row, index) => {
        const value = row[key];
        if (!Number.isFinite(Number(value))) return;
        if (!started) {
          ctx.moveTo(x(index), y(Number(value)));
          started = true;
        } else {
          ctx.lineTo(x(index), y(Number(value)));
        }
      });
      ctx.stroke();
    };
    drawLine("ma20", "#2f6fa9");
    drawLine("ma60", "#a96a16");
    drawLine("ma120", "#5d5fa8");

    if (hoverIndex != null && hoverIndex >= view.start && hoverIndex < view.end) {
      const local = hoverIndex - view.start;
      const cx = x(local);
      ctx.strokeStyle = "#2a3439";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, priceTop);
      ctx.lineTo(cx, volTop + volHeight);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [visible, hoverIndex, view, rows.length]);

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

  return <Panel className="stock-chart-panel" title="前复权日 K 与成交量" action={<div className="chart-actions"><button className="icon-button" type="button" aria-label="放大图表" title="放大" onClick={() => zoom(0.75)}><ZoomIn size={16} aria-hidden="true" /></button><button className="icon-button" type="button" aria-label="缩小图表" title="缩小" onClick={() => zoom(1.25)}><ZoomOut size={16} aria-hidden="true" /></button></div>}>
    <div className="chart-toolbar" aria-label="区间切换">
      {[60, 120, 250].map((size) => <button key={size} className={view.end - view.start === Math.min(size, rows.length) ? "active" : ""} onClick={() => updateView({ start: rows.length - size, end: rows.length })}>{size}日</button>)}
      <button className={view.start === 0 && view.end === rows.length ? "active" : ""} onClick={() => updateView({ start: 0, end: rows.length })}>全部</button>
      <span>MA20</span><span>MA60</span><span>MA120</span>
    </div>
    <div
      ref={wrapRef}
      className="stock-canvas-wrap"
      tabIndex={0}
      role="img"
      aria-label="同花顺前复权 K 线图，可用鼠标滚轮缩放、拖拽平移，键盘左右键平移，加减键缩放"
      onWheel={(event) => { event.preventDefault(); zoom(event.deltaY < 0 ? 0.85 : 1.15); }}
      onMouseMove={(event) => { if (drag.current) { const dx = event.clientX - drag.current.x; const step = Math.round((-dx / Math.max(1, event.currentTarget.clientWidth - 62)) * (drag.current.view.end - drag.current.view.start)); updateView({ start: drag.current.view.start + step, end: drag.current.view.end + step }); } setHoverIndex(indexFromClientX(event.clientX)); }}
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
      <strong className={tone((hover.close_price - hover.open_price) / hover.open_price)}>收 {fmt.number(hover.close_price)}</strong>
      <span>额 {moneyYi(hover.turnover)}</span>
    </div>}
  </Panel>;
}

export function StockOverview() {
  const [queryText, setQueryText] = useState(DEFAULT_QUERY);
  const [submitted, setSubmitted] = useState(DEFAULT_QUERY);
  const [activeTab, setActiveTab] = useState<"trend" | "finance" | "roadmap">("trend");
  const windowRange = useMemo(() => buildDateWindow(RANGE_DAYS), [submitted]);

  const symbolQuery = useQuery({
    queryKey: ["stock-symbol", submitted],
    queryFn: () => api.post<JsonMap>("/market/tickers/search", { keyword: submitted, asset_type: "a-share", limit: 10 }, 25_000),
  });

  const symbols = unwrapItems(symbolQuery.data) as SymbolItem[];
  const exact = symbols.filter((item) => item.asset_type === "a-share" && (item.name === submitted || item.name === DEFAULT_QUERY || item.ticker === submitted || item.thscode === submitted.toUpperCase()));
  const selected = exact.length === 1 ? exact[0] : symbols.length === 1 ? symbols[0] : null;

  const snapshotQuery = useQuery({
    queryKey: ["stock-snapshot", selected?.thscode],
    enabled: Boolean(selected?.thscode),
    queryFn: () => api.post<JsonMap>("/market/a-share/snapshot", { thscodes: selected?.thscode }, 30_000),
  });

  const historyQuery = useQuery({
    queryKey: ["stock-history", selected?.thscode, windowRange.start, windowRange.end],
    enabled: Boolean(selected?.thscode),
    queryFn: () => api.post<JsonMap>("/market/a-share/history", { thscode: selected?.thscode, start_date: windowRange.start, end_date: windowRange.end, adjust: "forward" }, 45_000),
  });

  const snapshot = unwrapItems(snapshotQuery.data)[0] || {};
  const rows = useMemo(() => normalizeRows(unwrapItems(historyQuery.data)), [historyQuery.data]);
  const latest = rows[rows.length - 1];
  const first = rows[0];
  const last60 = rows.slice(-60);
  const last20 = rows.slice(-20);
  const rangePct = pct(first?.close_price, latest?.close_price);
  const avg20Turnover = avgTurnover(last20);
  const updatedAt = Number(snapshotQuery.data?.timestamp || historyQuery.data?.timestamp || Date.now());
  const loading = symbolQuery.isLoading || snapshotQuery.isLoading || historyQuery.isLoading;
  const error = symbolQuery.error || snapshotQuery.error || historyQuery.error;

  function submit() {
    setSubmitted(queryText.trim() || DEFAULT_QUERY);
  }

  return <div className="page stock-page">
    <div className="page-title">
      <div><span className="eyebrow">A-SHARE TRENDS</span><h1>单股行情与趋势速览</h1><p>标的消歧、前复权 K 线、成交量与均线联动分析</p></div>
      <button className="icon-button" type="button" aria-label="刷新数据" title="刷新数据" onClick={() => { symbolQuery.refetch(); snapshotQuery.refetch(); historyQuery.refetch(); }}><RefreshCw size={17} aria-hidden="true" /></button>
    </div>

    <div className="toolbar">
      <label className="search-field"><span className="sr-only">股票名称或代码</span><Search size={16} aria-hidden="true" /><input value={queryText} name="stock_query" autoComplete="off" onChange={(event) => setQueryText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder="输入股票名称、代码或 thscode…" /></label>
      <button className="primary" type="button" onClick={submit}>查询</button>
    </div>

    {symbolQuery.data && !selected && <Panel><Empty>{symbols.length ? "搜索结果不唯一，请输入更精确的股票名称或代码" : "未找到 A 股标的"}</Empty></Panel>}
    {error ? <ErrorState error={error} /> : loading ? <Loading label="正在读取 Fuyao / HiThink 行情数据" /> : selected && rows.length ? <>
      <Panel className="stock-hero">
        <div className="stock-identity">
          <div><span>{selected.thscode}</span><h2>{selected.name || submitted}</h2><p>数据源 Fuyao / HiThink REST API · 前复权日线 · {dateText(first.date_ms)} 至 {dateText(latest.date_ms)}</p></div>
          <div className="stock-price"><span>最新价</span><strong className={tone(snapshot.price_change_ratio_pct)}>{fmt.number(snapshot.last_price ?? latest.close_price)}</strong><small className={tone(snapshot.price_change_ratio_pct)}>{fmt.number(snapshot.price_change)} / {fmt.percent(snapshot.price_change_ratio_pct)}</small></div>
        </div>
      </Panel>

      <div className="segmented stock-tabs" role="tablist" aria-label="个股看板视图">
        <button className={activeTab === "trend" ? "active" : ""} onClick={() => setActiveTab("trend")}>行情趋势</button>
        <button className={activeTab === "finance" ? "active" : ""} onClick={() => setActiveTab("finance")}>财务体检</button>
        <button className={activeTab === "roadmap" ? "active" : ""} onClick={() => setActiveTab("roadmap")}>灵感路线</button>
      </div>

      {activeTab === "trend" && <>
        <div className="metric-grid stock-metrics">
          <Metric label="区间涨跌幅" value={fmt.percent(rangePct)} detail={`${rows.length} 个交易日`} tone={tone(rangePct)} />
          <Metric label="MA20 / MA60" value={`${fmt.number(latest.ma20)} / ${fmt.number(latest.ma60)}`} detail={`MA120 ${fmt.number(latest.ma120)}`} />
          <Metric label="近60日最大回撤" value={fmt.percent(maxDrawdown(last60))} detail="按收盘价计算" tone="down" />
          <Metric label="20日平均成交额" value={moneyYi(avg20Turnover)} detail={`最新成交额 ${moneyYi(snapshot.turnover ?? latest.turnover)}`} />
        </div>

        <StockChart rows={rows} />
      </>}

      {activeTab === "finance" && <FinancialHealth selected={selected} />}
      {activeTab === "roadmap" && <InspirationRoadmap />}

      <div className="stock-footnote">
        <span>标的代码：{selected.thscode}</span>
        <span>数据时间：{dateText(updatedAt)}</span>
        <span>复权口径：前复权 forward</span>
        <span>数据源：Fuyao / HiThink</span>
        <strong>非投资建议</strong>
      </div>
    </> : <Panel><Empty>暂无可展示行情数据</Empty></Panel>}
  </div>;
}
