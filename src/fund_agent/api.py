"""FastAPI entrypoint for the A-share research application."""

from __future__ import annotations

import asyncio
import logging
import math
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import storage
from .agents.graph import get_market_agent, query_market_with_audit
from .cache import cache
from .config import settings
from .data_sources.fuyao_source import FuyaoDataSource

logger = logging.getLogger(__name__)
fuyao = FuyaoDataSource()


def clean_nan(value):
    if isinstance(value, dict):
        return {key: clean_nan(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_nan(item) for item in value]
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


@asynccontextmanager
async def lifespan(app: FastAPI):
    await cache.init()
    storage.init_db()
    if settings.OPENAI_API_KEY:
        get_market_agent()
    logger.info("A-share research API started")
    yield
    await cache.close()


app = FastAPI(title="A-Share Research API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1)


class TickerSearchRequest(BaseModel):
    keyword: str = Field(min_length=1)
    asset_type: Optional[str] = "a-share"
    limit: int = Field(default=10, ge=1, le=50)


class SnapshotRequest(BaseModel):
    thscodes: str = Field(min_length=1)


class HistoryRequest(BaseModel):
    thscode: str = Field(min_length=1)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    adjust: str = "forward"


class FinancialsRequest(BaseModel):
    thscode: str = Field(min_length=1)
    statement: str = "income"
    period: str = "annual"
    limit: int = Field(default=4, ge=1, le=20)


class IndexListRequest(BaseModel):
    tag: str = "cn_concept"


class IndexConstituentsRequest(BaseModel):
    thscode: str = Field(min_length=1)


class IndexHistoryRequest(BaseModel):
    thscode: str = Field(min_length=1)
    start_date: str
    end_date: str


class SpecialRankingRequest(BaseModel):
    period: str = "hour"
    limit: int = Field(default=30, ge=1, le=100)


class HotStockTrendRequest(BaseModel):
    thscode: str
    start_date: str
    end_date: str


class AnomalyStockRequest(BaseModel):
    thscodes: str = Field(min_length=1)


class WatchlistRequest(BaseModel):
    codes: list[str] = Field(default_factory=list, max_length=100)


async def _call(method, *args, **kwargs):
    return clean_nan(await asyncio.to_thread(method, *args, **kwargs))


@app.get("/")
async def root():
    return {"message": "A 股研究 API", "version": app.version, "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/data-sources/status")
async def data_sources_status():
    try:
        from .tools import ALL_TOOLS
        tool_count = len(ALL_TOOLS)
    except Exception:
        tool_count = 0
    return {
        "fuyao": {
            "enabled": fuyao.is_available(),
            "api_key_configured": bool(fuyao.api_key),
            "base_url": fuyao.base_url,
            "purpose": "A 股行情、财务、指数和特色市场数据",
        },
        "cache": {
            "enabled": cache.enabled,
            "connected": cache._async_client is not None,
            "configured": settings.CACHE_ENABLED,
            "local_memory": True,
        },
        "sqlite": {"enabled": True, **storage.db_info()},
        "agent": {"tool_count": tool_count},
    }


@app.post("/chat")
async def chat(request: ChatRequest):
    if not settings.OPENAI_API_KEY:
        return {"success": False, "error": "OPENAI_API_KEY 未配置"}
    try:
        result = await query_market_with_audit(request.question)
        return {"success": True, **result, "question": request.question}
    except Exception as exc:
        logger.exception("market agent failed")
        return {"success": False, "error_type": type(exc).__name__, "error": str(exc)}


@app.post("/market/tickers/search")
async def search_market_ticker(request: TickerSearchRequest):
    return await _call(fuyao.search_tickers, request.keyword, request.asset_type, request.limit)


@app.post("/market/a-share/snapshot")
async def get_a_share_snapshot(request: SnapshotRequest):
    return await _call(fuyao.get_a_share_snapshot, request.thscodes)


@app.post("/market/a-share/history")
async def get_a_share_history(request: HistoryRequest):
    return await _call(
        fuyao.get_a_share_history,
        request.thscode,
        start=request.start_date,
        end=request.end_date,
        adjust=request.adjust,
    )


@app.post("/market/a-share/financials")
async def get_a_share_financials(request: FinancialsRequest):
    return await _call(fuyao.get_financials, request.thscode, request.statement, request.period, request.limit)


@app.post("/market/a-share/financial-indicators")
async def get_a_share_financial_indicators(request: FinancialsRequest):
    return await _call(fuyao.get_financial_indicators, request.thscode, request.period, request.limit)


@app.get("/market/a-share/trading-days")
async def get_a_share_trading_days():
    return await _call(fuyao.get_trading_days)


@app.post("/market/index/list")
async def list_market_indexes(request: IndexListRequest):
    return await _call(fuyao.list_ths_indexes, request.tag)


@app.post("/market/index/constituents")
async def get_market_index_constituents(request: IndexConstituentsRequest):
    return await _call(fuyao.get_index_constituents, request.thscode)


@app.post("/market/index/snapshot")
async def get_market_index_snapshot(request: SnapshotRequest):
    return await _call(fuyao.get_index_snapshot, request.thscodes)


@app.post("/market/index/history")
async def get_market_index_history(request: IndexHistoryRequest):
    return await _call(fuyao.get_index_history, request.thscode, request.start_date, request.end_date)


@app.post("/market/a-share/hot-stock")
async def get_a_share_hot_stock(request: SpecialRankingRequest):
    return await _call(fuyao.get_hot_stock_list, request.period, request.limit)


@app.post("/market/a-share/skyrocket")
async def get_a_share_skyrocket(request: SpecialRankingRequest):
    return await _call(fuyao.get_skyrocket_list, request.period)


@app.post("/market/a-share/hot-stock-trend")
async def get_a_share_hot_stock_trend(request: HotStockTrendRequest):
    return await _call(fuyao.get_hot_stock_rank_trend, request.thscode, request.start_date, request.end_date)


@app.post("/market/a-share/anomaly-analysis-stock")
async def get_a_share_anomaly_analysis_stock(request: AnomalyStockRequest):
    return await _call(fuyao.get_anomaly_analysis_stock, request.thscodes)


@app.post("/market/a-share/limit-up-pool")
async def get_limit_up_pool(request: SpecialRankingRequest):
    return await _call(fuyao.get_limit_up_pool, page=1, size=request.limit)


@app.get("/user/watchlist/stock")
async def get_stock_watchlist():
    return {"kind": "stock", "codes": await asyncio.to_thread(storage.get_watchlist, "stock")}


@app.put("/user/watchlist/stock")
async def put_stock_watchlist(request: WatchlistRequest):
    codes = await asyncio.to_thread(storage.set_watchlist, "stock", request.codes)
    return {"kind": "stock", "codes": codes}


def main():
    import uvicorn
    uvicorn.run("fund_agent.api:app", host="0.0.0.0", port=8003, reload=True)
