"""A-share LangChain tools backed by Fuyao / HiThink REST APIs."""

from datetime import date, timedelta
from typing import Optional

from langchain_core.tools import tool

from ..data_sources.fuyao_source import FuyaoDataSource

_source = FuyaoDataSource()


@tool
def search_a_share_ticker(keyword: str, asset_type: Optional[str] = "a-share", limit: int = 10) -> dict:
    """搜索 A 股股票或指数，返回 thscode。输入名称、代码或简称时使用。"""
    return _source.search_tickers(keyword, asset_type=asset_type, limit=min(max(limit, 1), 50))


@tool
def get_a_share_snapshot(thscodes: str) -> dict:
    """获取一个或多个 A 股标的的行情快照。"""
    return _source.get_a_share_snapshot(thscodes=thscodes)


@tool
def get_a_share_history(
    thscode: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    adjust: str = "forward",
) -> dict:
    """获取 A 股历史日线；日期格式为 YYYY-MM-DD。"""
    end_date = end_date or date.today().isoformat()
    start_date = start_date or (date.today() - timedelta(days=365)).isoformat()
    return _source.get_a_share_history(thscode, start=start_date, end=end_date, adjust=adjust)


@tool
def get_a_share_financials(
    thscode: str,
    statement: str = "income",
    period: str = "annual",
    limit: int = 4,
) -> dict:
    """获取 A 股利润表、资产负债表或现金流量表。"""
    return _source.get_financials(thscode=thscode, statement=statement, period=period, limit=limit)


@tool
def get_a_share_financial_indicators(thscode: str, period: str = "annual", limit: int = 4) -> dict:
    """获取 A 股财务指标。"""
    return _source.get_financial_indicators(thscode=thscode, period=period, limit=limit)


@tool
def get_a_share_trading_days() -> dict:
    """获取近一年 A 股交易日历。"""
    return _source.get_trading_days()


@tool
def list_ths_indexes(tag: str = "cn_concept") -> dict:
    """获取同花顺行业、地域或概念指数目录。"""
    return _source.list_ths_indexes(tag=tag)


@tool
def get_index_constituents(thscode: str) -> dict:
    """获取指数或板块成分股。"""
    return _source.get_index_constituents(thscode)


@tool
def get_index_snapshot(thscodes: str) -> dict:
    """获取指数或板块行情快照。"""
    return _source.get_index_snapshot(thscodes)


@tool
def get_limit_up_pool(page: int = 1, size: int = 50) -> dict:
    """获取涨停股票池。"""
    return _source.get_limit_up_pool(page=page, size=min(max(size, 1), 100))
