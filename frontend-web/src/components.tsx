import type { ReactNode } from "react";
import { AlertCircle, Info, LoaderCircle } from "lucide-react";

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && <header className="panel-head"><h2>{title}</h2>{action}</header>}
      {children}
    </section>
  );
}

export function Metric({ label, value, detail, tone = "neutral", help }: { label: string; value: ReactNode; detail?: ReactNode; tone?: "neutral" | "up" | "down"; help?: ReactNode }) {
  return <div className="metric"><span className="metric-label">{label}{help && <span className="term-help" tabIndex={0} aria-label={`${label}解释`}><Info size={12} aria-hidden="true" /><span className="term-tip" role="tooltip">{help}</span></span>}</span><strong className={tone}>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function Loading({ label = "正在读取数据" }: { label?: string }) {
  return <div className="state" aria-live="polite"><LoaderCircle className="spin" size={18} aria-hidden="true" /><span>{label.endsWith("…") ? label : `${label}…`}</span></div>;
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "请求失败";
  return <div className="state error" role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{message}</span></div>;
}

export function Empty({ children = "暂无数据" }: { children?: ReactNode }) {
  return <div className="state muted">{children}</div>;
}

export function DataTable({ rows, columns, empty = "暂无数据" }: { rows: Record<string, any>[]; columns: { key: string; label: string; render?: (value: any, row: Record<string, any>) => ReactNode }[]; empty?: string }) {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? row.thscode ?? row[columns[0].key] ?? index)}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row[column.key], row) : String(row[column.key] ?? "-")}</td>)}</tr>)}</tbody></table></div>;
}

export const fmt = {
  number(value: any, digits = 2) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "-";
  },
  percent(value: any) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(2)}%` : "-";
  },
  money(value: any) {
    const number = Number(value);
    return Number.isFinite(number) ? `¥${number.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : "-";
  },
};

export function tone(value: any): "up" | "down" | "neutral" {
  const number = Number(value);
  return number > 0 ? "up" : number < 0 ? "down" : "neutral";
}

export function dateText(ms: number) {
  return new Date(ms).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function moneyYi(value: any) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number / 100000000).toFixed(2)}亿` : "-";
}

export function pct(from?: number, to?: number) {
  if (!from || !to) return null;
  return ((to - from) / from) * 100;
}

/** 构造截止今天的 N 天日期窗口（ISO yyyy-mm-dd）。 */
export function buildDateWindow(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}
