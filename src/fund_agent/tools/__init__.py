"""LangChain tools exposed to the A-share research agent."""

from .fuyao_tools import (
    get_a_share_financial_indicators,
    get_a_share_financials,
    get_a_share_history,
    get_a_share_snapshot,
    get_a_share_trading_days,
    get_index_constituents,
    get_index_snapshot,
    get_limit_up_pool,
    list_ths_indexes,
    search_a_share_ticker,
)

ALL_TOOLS = [
    search_a_share_ticker,
    get_a_share_snapshot,
    get_a_share_history,
    get_a_share_financials,
    get_a_share_financial_indicators,
    get_a_share_trading_days,
    list_ths_indexes,
    get_index_constituents,
    get_index_snapshot,
    get_limit_up_pool,
]

__all__ = ["ALL_TOOLS", *[tool.name for tool in ALL_TOOLS]]
