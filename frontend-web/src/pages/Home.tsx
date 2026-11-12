import { Activity, ArrowRight, Bot, DatabaseZap, Flame, LineChart, Network } from "lucide-react";

const workflows = [
  { href: "#stock", icon: LineChart, title: "个股研究", text: "查看行情、历史走势和季度财务三表。" },
  { href: "#watchlist", icon: Activity, title: "自选异动", text: "保存关注标的，集中查看快照和当日异动。" },
  { href: "#concept", icon: Network, title: "指数与板块", text: "查看指数目录、成分股和板块行情。" },
  { href: "#heat", icon: Flame, title: "热度雷达", text: "观察热股榜、飙升榜和排名趋势。" },
];

type Props = { online: boolean; cache: string; toolCount: number | null };

export function Home({ online, cache, toolCount }: Props) {
  return <div className="landing">
    <header className="landing-top"><a className="landing-brand" href="#home"><span className="landing-mark">AR</span><span className="landing-brand-copy"><strong>A-Research</strong><small>A 股研究台</small></span></a><div className={`landing-status ${online ? "on" : "off"}`}><i /><span>{online ? "后端已连接" : "后端离线"}</span>{online && <><em>·</em><span>{cache}</span></>}</div></header>
    <section className="landing-hero"><span className="eyebrow">自托管 · A 股研究工作台</span><h1>把行情、财务和板块研究<br />收进同一个工作台。</h1><p>后端统一调用 Fuyao / HiThink 数据，区分行情时间、报告期和数据来源，让每个研究结论都能回到真实数据。</p><div className="hero-actions"><a className="cta" href="#stock">开始个股研究 <ArrowRight size={16} /></a><a className="cta-ghost" href="#chat">打开研究助手</a></div><dl className="hero-proof"><div><dt>研究入口</dt><dd>4 个</dd></div><div><dt>数据源</dt><dd>Fuyao</dd></div><div><dt>Agent 工具</dt><dd>{toolCount ?? "—"}</dd></div><div><dt>部署</dt><dd>自托管</dd></div></dl></section>
    <section className="landing-workflows"><div className="section-head"><h2>研究入口</h2><p>从单只股票、关注列表或市场热度开始。</p></div><div className="workflow-grid">{workflows.map((item) => { const Icon = item.icon; return <a className="workflow-card" href={item.href} key={item.href}><span className="workflow-icon"><Icon size={20} /></span><strong>{item.title}</strong><span className="workflow-text">{item.text}</span><span className="workflow-go">进入 <ArrowRight size={15} /></span></a>; })}</div></section>
    <section className="landing-tools"><div className="section-head"><h2>系统入口</h2><p>需要时查看自然语言助手和运行状态。</p></div><div className="tool-directory"><a href="#chat"><Bot size={18} /><span><strong>研究助手</strong><small>使用工具查询并解释 A 股数据</small></span><ArrowRight size={15} /></a><a href="#data"><DatabaseZap size={18} /><span><strong>数据状态</strong><small>检查 API、缓存和 Fuyao 配置</small></span><ArrowRight size={15} /></a></div></section>
    <footer className="landing-foot"><span>A-Research · 数据仅供研究参考，不构成投资建议</span><a href="#stock">开始研究 →</a></footer>
  </div>;
}

export default Home;
