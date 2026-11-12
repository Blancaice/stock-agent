# A-Research

基于 FastAPI、LangGraph 和 Fuyao / HiThink REST API 的 A 股研究工作台。

项目只做公开市场数据的查询、整理和解释，不接入真实交易，也不输出自动买卖指令。

## 当前主线

- 股票和指数标的搜索
- A 股行情快照、历史 K 线和交易日历
- 利润表、资产负债表、现金流量表和财务指标
- 指数 / 板块目录、成分股和行情
- 热股、飙升榜和当日异动
- 自选股 SQLite 持久化
- 基于真实工具结果的自然语言研究助手和工具审计

## 技术栈

- 后端：Python 3.12、FastAPI、Pydantic
- Agent：LangChain、LangGraph、OpenAI 兼容接口
- 数据源：Fuyao / HiThink REST API
- 缓存：Redis（可选）和进程内缓存
- 持久化：SQLite（仅保存自选股）
- 前端：React、TypeScript、Vite、TanStack Query

## 数据边界

行情数据、财务报告和特色榜单的刷新频率不同。接口返回的数据应区分行情时间、报告期、抓取时间和数据源，不能把财务报告期解释为实时持仓或实时行情。

接口契约以 [`docs/fuyao-llms-full.txt`](docs/fuyao-llms-full.txt) 为准；MCP 只用于开发期验证，运行时直接调用 REST API。

## 启动

```bash
pip install -r requirements.txt
python -m uvicorn src.fund_agent.api:app --reload --port 8003
```

前端：

```bash
cd frontend-web
npm install
npm run dev
```

需要配置：

```env
HITHINK_FINANCE_API_KEY=your-key
OPENAI_API_KEY=your-key       # 仅使用 /chat 时需要
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
REDIS_URL=redis://localhost:6379/0
CACHE_ENABLED=true
```

## 主要 API

| API | 说明 |
|---|---|
| `POST /market/tickers/search` | 搜索 A 股或指数标的 |
| `POST /market/a-share/snapshot` | 行情快照 |
| `POST /market/a-share/history` | 历史 K 线 |
| `POST /market/a-share/financials` | 财务三表 |
| `POST /market/a-share/financial-indicators` | 财务指标 |
| `POST /market/index/list` | 指数 / 板块目录 |
| `POST /market/index/constituents` | 指数 / 板块成分股 |
| `POST /market/a-share/hot-stock` | 热股榜 |
| `POST /market/a-share/skyrocket` | 飙升榜 |
| `POST /market/a-share/anomaly-analysis-stock` | 当日异动 |
| `GET/PUT /user/watchlist/stock` | 自选股 |
| `POST /chat` | A 股研究助手 |
| `GET /data-sources/status` | 服务和数据源状态 |

## 目录

```text
src/fund_agent/
├── api.py                 # FastAPI 入口
├── storage.py             # 自选股 SQLite 持久化
├── cache.py               # Redis / 内存缓存
├── data_sources/
│   └── fuyao_source.py    # Fuyao / HiThink REST 封装
├── tools/
│   └── fuyao_tools.py     # A 股 Agent 工具
└── agents/graph.py        # A 股研究 Agent

frontend-web/src/
├── pages/StockOverview.tsx
├── pages/WatchlistAnomalies.tsx
├── pages/IndexConstituents.tsx
├── pages/HeatRadar.tsx
├── pages/Chat.tsx
└── pages/DataStatus.tsx
```
