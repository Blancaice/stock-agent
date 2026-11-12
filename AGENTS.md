## 金融数据接口契约

本项目所有金融数据 API / MCP 设计、接入、排错和代码生成，以
`docs/fuyao-llms-full.txt` 为优先接口契约参考；该文件来自：

<https://fuyao.aicubes.cn/llms-full.txt>

MCP 配置说明见 `docs/fuyao-mcp.md`。MCP 只服务 Codex / IDE 开发期验证和排错；
项目运行时使用 Fuyao / HiThink REST API，不依赖 Codex MCP。

## 当前实现状态

### 数据源原则

- 基金数据优先使用 Fuyao / HiThink REST API：基金基础资料、披露持仓、净值、区间收益、持有人结构、ETF 行情等。
- Fuyao 无数据、无权限或能力暂缺时，基金数据回退 Akshare / Tushare。
- A 股、指数、板块、财务、特色市场数据优先使用 Fuyao / HiThink REST API。
- Tushare 是可选补充源；未安装 `tushare` 时只应提示警告，不应阻塞系统。
- `hithink-finance` Skill 可作为 Codex 开发期接口、路由和安全规范参考，不作为 FastAPI 生产运行时依赖。

### 运行时入口

- 后端：`src/fund_agent/api.py`
- Agent 图：`src/fund_agent/agents/graph.py`
- 数据源：`src/fund_agent/data_sources/`
- LangChain 工具：`src/fund_agent/tools/`
- 主前端：`frontend-web/`
- 测试：`tests/`

### 关键 API

- 对话：`POST /chat`
- 数据源状态：`GET /data-sources/status`
- Fuyao A 股/指数/板块：
  - `/market/tickers/search`
  - `/market/a-share/snapshot`
  - `/market/a-share/history`
  - `/market/a-share/financials`
  - `/market/a-share/financial-indicators`
  - `/market/a-share/trading-days`
  - `/market/index/list`
  - `/market/index/constituents`
  - `/market/index/snapshot`
- Fuyao 公募基金：
  - `/market/fund/search`
  - `/market/fund/profile`
  - `/market/fund/holdings`
  - `/market/fund/nav`
  - `/market/fund/returns`
  - `/market/fund/holders`
  - `/market/fund/market-snapshot`
  - `/market/fund/market-history`

## Agent 数据调用规则

- 凡是涉及基金、股票、指数、板块、净值、持仓、收益、风险、排行、推荐、估值、行情等数据类问题，必须调用工具/数据源，不允许 LLM 编造。
- 只有纯问候、概念解释、非数据类闲聊才可以不查数据。
- `/chat` 入口统一交给 LangGraph Agent，不在 API 层用关键词抢答。
- Agent 使用 `llm.bind_tools(ALL_TOOLS)` 自主选择工具；工程层只校验具体金融数据回答必须有工具返回证据。
- Agent 对基金资料、净值、持仓、收益、持有人结构优先选择 Fuyao 基金工具；失败时再回退 Akshare/Tushare 工具。
- 不应新增“某类问题命中关键词就直接调用某工具”的快捷路径；优先完善工具 docstring、系统提示、工具调用审计和测试集。
- `/chat` 返回 `tool_audit`，前端应展示回答实际使用的数据源/工具。

## 环境变量

- `OPENAI_API_KEY`：LLM API Key。
- `OPENAI_BASE_URL`：OpenAI 兼容 API 地址。
- `OPENAI_MODEL`：模型名称。
- `HITHINK_FINANCE_API_KEY`：Fuyao / HiThink 推荐 API Key 名称。
- `FUYAO_API_KEY`、`FUYAO_TOKEN`：兼容旧配置名。
- `TUSHARE_TOKEN`：可选补充数据源。
- `REDIS_URL`、`CACHE_ENABLED`、`CACHE_TTL`：缓存配置。

## 推荐启动命令

Windows PowerShell：

```powershell
cd D:\codeproject\fund-agent
.\venv\Scripts\activate
python -m uvicorn src.fund_agent.api:app --reload --port 8003
```

另开窗口：

```powershell
cd D:\codeproject\fund-agent\frontend-web
npm install
npm run dev
```

浏览器访问 `http://localhost:5173`。

## 推荐测试命令

```powershell
pytest tests
```

如依赖未安装：

```powershell
uv pip install -r requirements.txt
uv pip install pytest pytest-asyncio
```

测试默认 mock 外部数据源，不应主动访问网络。

## 2026-07 本轮改动与待办

### 重要事实：数据源未改动

本轮**没有切换任何数据源**。市场热门页（`/dashboard/discovery`）自始至终走
**Akshare**（`fund_open_fund_rank_em`，底层东方财富），不是同花顺。同花顺
（Fuyao / HiThink）没有「全市场基金排行榜」能力，基金排行候选池只能用 Akshare。

各页面实际数据源：
- 市场热门 / 基金排行候选池：Akshare（东财排行榜，冷数据单次约 52 秒）
- 基金详情 / 对比 / 新手选基 / 持仓体检：优先同花顺，失败回退 Akshare
- 个股 / 热度雷达 / 概念联动：同花顺

### 已完成

1. **前端外壳重构**（`frontend-web/src/App.tsx`、`pages/Home.tsx`、`styles.css`）
   - 侧栏状态区与栏目重合修复：`nav` 改为自身可滚动，`sidebar-status` 加
     `flex-shrink:0` 作为不可压缩底部 footer。
   - 首页改为全屏落地页（无侧栏），点卡片进入功能页后才出现侧栏。
   - 配色改为现代轻盈浅色风（翡翠绿 `--accent`、雾绿底、大圆角、柔阴影）。
   - 删掉落地页的「部署形态」三段（本地/内网/演示，非用户内容）。
   - 市场总览默认改为「市场热门」在前，分段顺序「市场热门 / 我的关注」。

2. **SQLite 持久层**（`src/fund_agent/storage.py`，新增）
   - 标准库 `sqlite3`，零新依赖，DB 落 `data/app.db`（`APP_DB_PATH` 可覆盖）。
   - `watchlist_items(kind, code, sort_order, updated_at)` 表，`kind` ∈ {fund, stock}。
   - `init_db` / `get_watchlist` / `set_watchlist` / `db_info`。
   - `api.py`：`lifespan` 建表；`/data-sources/status` 加 `sqlite` 项；
     新增 `GET/PUT /user/watchlist/{kind}`。
   - 前端 `Dashboard.tsx` / `WatchlistAnomalies.tsx`：关注列表改为后端 source
     of truth，localStorage 降级为本地读缓存 + 断线兜底。`api.ts` 加 `api.put`。
   - **未触碰持仓/交易记录持久化**：那是新增功能不是迁移，待产品决策。

3. **dashboard 卡顿治理（部分）**（`api.py`）
   - `warm_common_caches`：启动时后台预热近1年榜单前 10 只基金净值到进程
     内存缓存，限流并发 3。
   - `get_dashboard_funds` / `get_dashboard_discovery`：批量构建加 `Semaphore(4)`
     限流，避免并发触发东财限流。
   - 前端 `Dashboard.tsx`：盘中估算默认关（`intraday=false`），加注释说明原因。

### 待办（按优先级）

1. **【高】验证当前后端能否返回市场热门数据**
   - 现象：用户反馈改后「没数据」。需确认是后端未运行，还是回归 bug。
   - 动作：起后端 → 打 `/dashboard/discovery`（`include_intraday=false`）→
     看是否返回 12 行。若空，对比改动前的行为定位回归点。

2. **【高】市场热门页冷数据耗时 ~100 秒，需进一步治理**
   - 实测：`include_intraday=false` 仍 ~103 秒，12 只里 3 只降级。
   - 根因：① akshare 排行榜单次 ~52 秒（144 行大表，不可避）；② 每只基金
     `get_nav_latest` 下载整年净值序列只为取末行。
   - 方向 A（推荐）：排行榜结果缓存 1 小时 + 每只基金明细切同花顺
     （`get_fund_nav` 只取最新）。第一次 ~60 秒，之后秒回。
   - 方向 B：市场热门页换候选池（同花顺股票热股榜/飙升榜，但语义从基金变股票）。
   - 2026-09-17 进展：Akshare 排行改为按基金类型缓存原始排行表 1 小时，再本地排序/截取；
     dashboard 最新净值改为 Fuyao 最新一条优先，失败再回 Akshare；启动预热改为直接预热
     前端默认「全部/近3月」榜单，避免 API 生命周期依赖 LangChain 工具。

3. **【中】同花顺能力澄清与利用**
   - 同花顺有：基金资料/持仓/净值/收益/持有人/ETF行情；**股票**热股榜/飙升榜/
     异动/趋势。
   - 同花顺无：基金排行榜、基金推荐、基金风险指标。
   - 现有 `HeatRadar` 页已接同花顺热股榜，可独立作为「市场热度」入口。
   - `hithink-finance` Skill 是开发期参考，非运行时依赖。

4. **【低】持仓/交易记录是否持久化**
   - 2026-07 状态：会话临时输入，不落盘。
   - 2026-09-17 已新增默认账户交易流水 SQLite 持久化：支持 CSV/JSON 导入、关键字段去重、
     金额按整数分存储、已保存流水读取；`/account/analyze` 无输入时可分析默认账户已保存流水。

## 2026-09-17 基金决策与执行 Agent 改造计划（待实现）

### 产品目标与当前授权范围

- 目标：基于真实基金数据持续监控持仓，生成有依据的买卖/持有方案，用户在手机端确认后执行，并跟踪结果；同时形成可复现、可评测的 AI Agent 实习项目。
- 本轮只更新计划和进行项目调研，不代表下列功能已实现，不授权真实下单、账户签约或自动买卖。
- README 当前仍定位为研究工具；实施新功能时同步更新产品定位、能力说明和演示边界。
- 保留 Fuyao/HiThink 优先、Akshare/Tushare 回退的运行时数据规则。数据查询权限不等于个人账户读取或交易权限。
- 首版聚焦一个研究 Agent 加计算、校验、审批、执行节点，不要求拆成多个自主 Agent。

### 交易渠道能力边界

- 普通支付宝手机网站支付、APP 支付、AI 付属于商户收款能力，不能当作基金申购接口；退款也不等于基金赎回。
- 尚未确认个人开发者可以通过官方通用接口交易本人支付宝内任意公募基金。不得虚构接口、已填单跳转链接或自动同步个人持仓能力。
- 特定现金管理产品接口不能推导为通用基金交易能力；支付宝收款 Skill 不适合作为本需求的交易实现。
- 三个交付层级：模拟交易（可独立完成）；真实辅助（生成操作清单，用户在渠道执行并补录结果）；官方交易（取得并验证渠道权限后接入）。
- 官方接入需验证：账户授权、持仓/可用份额、申购/赎回申请、官方确认入口、订单查询与回报、适用标的和业务规则。
- 无官方入口时提供复制基金代码/操作清单，不承诺一键到达预填金额的交易页；不以逆向私有接口或手机自动点击作为默认生产方案。
- 若面向其他用户提供真实交易或商业化建议，需另行确认基金销售、投顾等业务边界；手机确认不替代业务准入。
- 券商 ETF 交易是可调研的扩展方向，不能据此默默将场外基金产品改成股票/ETF 产品；也不能用券商 API 卖出支付宝账户中的场外基金。

### 分阶段待办与验收

1. **P0：稳定数据与确认渠道能力**
   - [x] 验证 `/dashboard/discovery` 有效结果和错误状态，重新测量耗时；2026-07 的约 100 秒是历史记录，不是当前实测。2026-09-17 已手动验证接口可返回有效榜单，冷请求超时阈值已从 35 秒调整为 80 秒。
   - [ ] 排行榜缓存约 1 小时、明细优先 Fuyao、后台刷新、并发限流；展示数据日期、缓存时间和降级原因。
   - [ ] 工具证据增加 `source/as_of/fetched_at/status/关键字段/原始结果引用`；不能把失败的 ToolMessage 或无关工具返回当成结论依据。2026-09-17 已在 Agent 审计层实现结构化 evidence，使用 `tool_call_id` 关联原始结果，并排除失败 ToolMessage；2026-09-18 已将 Fuyao 最新净值毫秒时间戳规范为上海时区 `YYYY-MM-DD`；无关结果的结论约束待通过评测场景完成，不增加关键词直达或工具特判。
   - [ ] 持仓穿透保留披露报告期，不能当成实时持仓；数据源缺失交易规则时明确未知。2026-09-17 已完成报告期状态传递：Akshare 保留报告期或标为仅年份，Fuyao 契约未提供报告期时明确 unknown，不再将响应 timestamp 当作报告期；2026-09-18 已同步修复候选研究的 Fuyao 持仓读取；交易规则未知将在执行渠道契约实现时补齐。
   - [x] 核实官方交易能力，记录支持/不支持/未确认及对应文档；未取得能力不阻塞模拟与辅助版本。2026-09-17 复核支付宝开放平台：公开可见申赎接口仅为企业支付宝余额申赎特定余利宝产品（基金代码 001529），不构成个人账户任意公募基金交易、持仓同步或订单回报能力；通用场外基金官方渠道为未确认/不支持，维持模拟交易和用户手动执行后补录的边界。参考：https://developer.alibaba.com/docs/doc.htm?articleId=105624&docType=1&source=search&treeId=193 、https://developer.alibaba.com/docs/api.htm?apiId=1197&docType=4 。

2. **P1：账户与交易账本持久化**
   - [x] 新增投资目标、期限、预算、现金预留、风险与集中度限制，保存规则版本。
   - [x] 保存默认账户与交易流水；流水含买卖/分红、费用、确认状态和来源。
   - [ ] 持仓批次、持仓快照仍待实现。2026-09-17 已实现默认账户的持仓快照：分析已保存账本时记录份额、成本、净值日期和估值，并可通过 `GET /account/snapshots/{account_id}` 读取；持仓批次与确认份额口径仍待实现。
   - [ ] CSV 导入预览仍待实现；已完成字段校验、重复导入去重和来源标记；保留当前账户分析与组合分析工具。
   - [x] 金额使用整数最小货币单位（分）；净值/份额按字符串保存以保留精度。渠道/产品持有期费用仍待规则化。
   - [ ] 本地单用户继续 SQLite，增加迁移机制；多人部署再评估 PostgreSQL 和用户隔离。
   - 验收：重启不丢记录、重复导入不重复记账、未确认份额不计入可卖份额。

3. **P1：结构化方案与持久 Agent 工作流**
   - [ ] 保留 `/chat` 统一进入 LangGraph 和模型自主选数据工具；不增加关键词直达交易路径。
   - [ ] 增加持久 checkpoint、人工中断与恢复；重启后可恢复待确认任务。2026-09-17 已新增 `agent_runs` SQLite 运行记录与 `thread_id`，并提供只读的「研究 → 诊断 → 校验」账户复核 MVP；尚未实现 LangGraph checkpoint 或中断恢复。
   - [x] 定义 TradeProposal 基础版：账户、基金、方向、金额/份额、理由、证据、校验、规则版本、有效期。
   - [ ] 前后配置、费用未知项和多版本修改仍待补齐。
   - [ ] LLM 负责理解、研究和解释；确定性代码负责金额、份额、指标、预算、集中度和可执行性校验。
   - [x] 已加入基础确定性校验：买入金额、卖出数量/金额、预算约束和证据缺失提示。
   - [ ] 复用 advisor.py 评分，但不能直接把现有固定风险模板当成个人交易依据；加入实际持仓、期限、费用和用户限制。
   - [ ] 首版策略为用户配置的定期投入和偏离阈值再平衡；支持正常输出“暂不操作”，不强制每日交易。2026-09-18 已新增后台策略草案 MVP：仅在用户保存规则后，集中度超限生成减仓草案；无偏离且有月度预算时，从真实排行候选中生成一只未持有基金的定投买入草案；草案复用已有未处理项，尚未补齐费率、确认日和持有期规则，不能视为可执行真实交易。
   - 验收：有效数据才生成可执行方案，超预算/份额不足等由程序拦截，方案可追溯到证据和规则版本。

4. **P1：手机确认与模拟执行闭环**
   - [ ] 适配现有 React 手机页面，提供持仓、今日待办、方案详情、执行记录；PWA 按需增加。
   - [x] 已新增桌面/移动共用的「交易方案」页面，可创建草稿、批准、拒绝。
   - [ ] 支持修改、过期、身份绑定和旧确认失效仍待实现。
   - [ ] 执行前再次检查账户、数据时效和规则；提醒链接仅打开登录后的页面，不能通过 GET 直接批准交易。
   - [ ] 新增执行器接口和 paper/manual 实现；正式渠道适配等官方文档和权限明确后开发。
   - [ ] 模拟场外基金申请、适用净值日期、费用与份额确认过程；不能用当前已知净值立即成交冒充真实效果。
   - [ ] 订单幂等、并发去重、超时先查询/待核对；禁止超时后盲目重复提交。
   - [ ] 区分待确认、已授权、提交中、结果未知、渠道受理、份额确认、资金到账、失败、取消等状态及合法迁移。
   - [ ] 区分用户补录与官方核验；打开渠道页面或前端回跳不能视为交易完成。
   - 验收：连点/重试只执行一次，崩溃可恢复，账本只按有依据的执行结果更新。

5. **P2：自动监控、提醒和真实辅助执行**
   - [ ] 定时检查用户配置与持仓，保存任务状态，失败可重试；相同条件下避免重复方案和提醒。
   - [ ] 待办提醒进入手机方案页；真实辅助版本提供操作清单和结果补录/导入，保留凭据来源。
   - [ ] 官方渠道若可用，另行实现授权、下单、官方确认、查询/回报验签与核对；不假定只需一次点击即可满足所有渠道要求。
   - [ ] 真实账户访问需身份认证，公开演示采用隔离模拟账户，密钥只在服务端存储且不进入模型上下文或日志。

6. **P2：评测、部署与实习展示**
   - [ ] 建立 50～100 个场景：名称消歧、无数据/过期数据、超预算、份额不足、拒绝/修改/过期、重复确认、超时和重启恢复。
   - [ ] 记录工具成功率、证据有效率、违规方案拦截率、任务完成率、耗时与成本；测试默认 mock 外部源。
   - [ ] 回测包含费用、适当基准、信息可用时间，避免未来数据与幸存者偏差；不将历史收益当成未来保证。
   - [ ] 完成部署说明、架构图、API 说明、评测报告、演示数据和视频。
   - [ ] 演示链路：导入模拟持仓 → 发现配置偏离 → 查询证据 → 生成方案 → 手机修改并重校验 → 确认 → 模拟执行 → 更新账本与审计。
   - [ ] 简历/README 明确模拟、真实辅助与真实交易的区别，不把未接入的交易能力写成已完成。

### 建议模块与 API（规划，尚未新增）

- `agents/graph.py`：有状态研究与方案工作流；`advisor.py`：账户约束下的评估。
- `services/portfolio_service.py`：账本；`services/proposal_service.py`：方案、版本与校验。
- `execution/base.py`、`paper.py`、`manual.py`：渠道能力、模拟和辅助执行。
- `jobs/`：定时监控与订单核对；存储模块增加业务表和迁移；`tests/`、`evals/` 增加验证。
- 规划 API：`POST /portfolio/import`、`GET /portfolio/positions`、`POST /agent/runs`、`GET /agent/runs/{id}`、`GET /proposals`、`POST /proposals/{id}/approve`、`POST /proposals/{id}/reject`、`GET /orders/{id}`、`POST /orders/{id}/manual-result`。
- 实施顺序：数据稳定 → 账户账本 → 结构化方案 → 手机确认与模拟执行 → 自动监控与真实辅助 → 官方交易适配。
- 工期参考：熟悉 Python/React 且每周约 20～30 小时投入时，前六阶段约六周；官方准入时间另计，不作保证。

### 参考依据

- 支付宝普通商户支付：https://developer.alibaba.com/docs/api.htm?apiId=1056&docType=4
- LangGraph 人工中断与恢复：https://docs.langchain.com/oss/python/langgraph/interrupts
- 基金销售机构准入：https://www.csrc.gov.cn/csrc/c101968/c4179949/content.shtml
- 参考项目：https://github.com/refraction-ray/xalpha （不默认引入依赖或更换数据源）。

### xalpha 调研记录（2026-09-17，静态阅读，未运行验证）

- 阅读 master 文件目录（当时 SHA：`a0727129e08140eea017a8f21294041ab53ca1d6`）、README、trade.py、backtest.py、realtime.py 和 question2report Skill。
- 可借鉴：基金交易账单重建、现金流与份额计算、费用/分红处理、组合穿透、策略回测，以及自然语言问题生成 HTML 研究报告的工作流。
- `backtest.py` 的 buy 操作更新 DataFrame 和 trade 对象，是模拟计算；不能凭 buy/trade/shengou 等命名认定已接实盘。
- `realtime.py` 提供建议与邮件提醒，源码已标记 deprecated，并明确不应过度干涉通知或可能的自动交易。
- Agent 支持主要体现为 `.agents/skills/question2report/SKILL.md` 驱动外部编码 Agent 查询、计算和生成报告；本次未发现与本项目目标对应的手机审批、官方基金下单和成交核对闭环。
- 后续可评估其计算模块或用其做账本/回测交叉验证，先验证口径、依赖和测试；不把 README 的精度表述当作已验证的实盘一致性保证。
- 国内真实程序化交易可另行调研券商提供的 QMT/xtquant；官方接口参考：https://dict.thinktrader.net/nativeApi/xttrader.html 。是否开放及支持哪些证券以券商账户权限为准。
