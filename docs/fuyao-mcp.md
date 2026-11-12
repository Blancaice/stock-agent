# Fuyao MCP 配置

本项目使用 `docs/fuyao-llms-full.txt` 作为同花顺金融数据 API / MCP 的接口契约。

## Codex MCP 服务

已按 Fuyao / HiThink 文档配置 HTTP MCP 服务。注意：本项目运行时通过
`src/fund_agent/data_sources/fuyao_source.py` 直接调用 REST API；MCP 主要服务
Codex / IDE 开发期验证和排错。

- `fuyao-a-share`：`https://fuyao.aicubes.cn/mcp/a-share`
- `fuyao-a-share-index`：`https://fuyao.aicubes.cn/mcp/a-share-index`
- `fuyao-meta`：`https://fuyao.aicubes.cn/mcp/meta`
- `fuyao-fund`：`https://fuyao.aicubes.cn/mcp/fund`

两个服务都通过请求头 `X-api-key` 鉴权。Codex 配置使用 `env_http_headers` 从环境变量读取密钥：

```toml
[mcp_servers.fuyao-a-share]
url = "https://fuyao.aicubes.cn/mcp/a-share"

[mcp_servers.fuyao-a-share.env_http_headers]
X-api-key = "HITHINK_FINANCE_API_KEY"

[mcp_servers.fuyao-a-share-index]
url = "https://fuyao.aicubes.cn/mcp/a-share-index"

[mcp_servers.fuyao-a-share-index.env_http_headers]
X-api-key = "HITHINK_FINANCE_API_KEY"

[mcp_servers.fuyao-meta]
url = "https://fuyao.aicubes.cn/mcp/meta"

[mcp_servers.fuyao-meta.env_http_headers]
X-api-key = "HITHINK_FINANCE_API_KEY"

[mcp_servers.fuyao-fund]
url = "https://fuyao.aicubes.cn/mcp/fund"

[mcp_servers.fuyao-fund.env_http_headers]
X-api-key = "HITHINK_FINANCE_API_KEY"
```

## 环境变量

`.env` 中应配置：

```env
HITHINK_FINANCE_API_KEY=your-hithink-finance-api-key
# 兼容旧配置名，也可以继续使用：
FUYAO_API_KEY=your-fuyao-api-key
```

为了让 Codex MCP 在启动时能读取到密钥，Windows 用户环境变量也需要设置
`HITHINK_FINANCE_API_KEY`、`FUYAO_API_KEY` 或旧版 `FUYAO_TOKEN`。修改后重启 Codex/终端。
