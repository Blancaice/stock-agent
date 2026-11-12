"""Fuyao / HiThink REST adapter for A-share research data."""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, time, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class FuyaoDataSource:
    BASE_URL = "https://fuyao.aicubes.cn"
    DEFAULT_TIMEOUT = 15.0
    SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")

    def __init__(self, api_key: Optional[str] = None, base_url: str = BASE_URL, timeout: float = DEFAULT_TIMEOUT):
        self.api_key = api_key or os.getenv("HITHINK_FINANCE_API_KEY", "") or os.getenv("FUYAO_API_KEY", "") or settings.FUYAO_API_KEY
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get_source_name(self) -> str:
        return "Fuyao/HiThink"

    def is_available(self) -> bool:
        return bool(self.api_key)

    def _get(self, path: str, params: Optional[dict[str, Any]] = None) -> dict:
        if not self.api_key:
            return {"error": "HITHINK_FINANCE_API_KEY 未配置", "source": self.get_source_name()}
        clean_params = {key: value for key, value in (params or {}).items() if value not in (None, "")}
        try:
            response = httpx.get(
                f"{self.base_url}{path}",
                params=clean_params,
                headers={"X-api-key": self.api_key},
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            logger.warning("Fuyao request failed: %s", exc)
            return {"error": f"Fuyao HTTP 请求失败: {exc}", "path": path, "source": self.get_source_name()}
        except ValueError as exc:
            return {"error": f"Fuyao 响应不是合法 JSON: {exc}", "path": path, "source": self.get_source_name()}

        if payload.get("code") != 0:
            return {
                "error": payload.get("message", "Fuyao API 返回业务错误"),
                "code": payload.get("code"),
                "request_id": payload.get("request_id"),
                "path": path,
                "source": self.get_source_name(),
            }
        data = payload.get("data") or {}
        if isinstance(data, dict):
            data.setdefault("request_id", payload.get("request_id"))
            data.setdefault("source", self.get_source_name())
        return data

    @classmethod
    def date_to_ms(cls, value: str | date | datetime | int) -> int:
        if isinstance(value, int):
            return value
        if isinstance(value, datetime):
            dt = value
        elif isinstance(value, date):
            dt = datetime.combine(value, time.min)
        else:
            text = value.strip()
            if len(text) == 8 and text.isdigit():
                dt = datetime.strptime(text, "%Y%m%d")
            elif len(text) == 10:
                dt = datetime.strptime(text, "%Y-%m-%d")
            else:
                dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=cls.SHANGHAI_TZ)
        return int(dt.timestamp() * 1000)

    @staticmethod
    def normalize_thscode(code: str) -> str:
        value = code.strip().upper()
        if "." in value or len(value) != 6 or not value.isdigit():
            return value
        if value.startswith(("6", "9")):
            return f"{value}.SH"
        if value.startswith(("0", "2", "3")):
            return f"{value}.SZ"
        if value.startswith(("4", "8")):
            return f"{value}.BJ"
        return value

    @classmethod
    def normalize_thscodes(cls, codes: str | list[str]) -> str:
        parts = [item.strip() for item in codes.split(",") if item.strip()] if isinstance(codes, str) else codes
        return ",".join(cls.normalize_thscode(item) for item in parts)

    def search_tickers(self, keyword: str, asset_type: Optional[str] = "a-share", limit: int = 10) -> dict:
        return self._get("/api/meta/tickers/search", {"q": keyword, "asset_type": asset_type, "limit": limit})

    def get_a_share_snapshot(self, thscodes: Optional[str | list[str]] = None, limit: int = 100, offset: int = 0) -> dict:
        params = {"thscodes": self.normalize_thscodes(thscodes)} if thscodes else {"limit": limit, "offset": offset}
        return self._get("/api/a-share/prices/snapshot", params)

    def get_a_share_history(
        self,
        thscode: str,
        start: str | date | datetime | int,
        end: str | date | datetime | int,
        interval: str = "1d",
        adjust: str = "forward",
        offset: int = 0,
    ) -> dict:
        return self._get(
            "/api/a-share/prices/historical",
            {"thscode": self.normalize_thscode(thscode), "interval": interval, "start": self.date_to_ms(start), "end": self.date_to_ms(end), "adjust": adjust, "offset": offset},
        )

    def get_financials(self, thscode: str, statement: str = "income", period: str = "annual", limit: int = 4, start=None, end=None) -> dict:
        paths = {"income": "/api/a-share/financials/income-statements", "balance": "/api/a-share/financials/balance-sheets", "cashflow": "/api/a-share/financials/cash-flow-statements"}
        path = paths.get(statement)
        if not path:
            return {"error": "statement 参数必须是 income / balance / cashflow", "source": self.get_source_name()}
        params: dict[str, Any] = {"thscode": self.normalize_thscode(thscode), "period": period}
        if start is not None and end is not None:
            params.update({"start": self.date_to_ms(start), "end": self.date_to_ms(end)})
        else:
            params["limit"] = limit
        return self._get(path, params)

    def get_financial_indicators(self, thscode: str, period: str = "annual", limit: int = 4, start=None, end=None) -> dict:
        params: dict[str, Any] = {"thscode": self.normalize_thscode(thscode), "period": period}
        if start is not None and end is not None:
            params.update({"start": self.date_to_ms(start), "end": self.date_to_ms(end)})
        else:
            params["limit"] = limit
        return self._get("/api/a-share/financials/indicators", params)

    def get_trading_days(self) -> dict:
        return self._get("/api/a-share/calendar/trading-days")

    def list_ths_indexes(self, tag: str = "cn_concept") -> dict:
        return self._get("/api/a-share-index/catalog/ths-index-list", {"tag": tag})

    def get_index_constituents(self, thscode: str) -> dict:
        return self._get("/api/a-share-index/constituents/ths-stock-list", {"thscode": self.normalize_thscode(thscode)})

    def get_index_snapshot(self, thscodes: str | list[str]) -> dict:
        return self._get("/api/a-share-index/prices/snapshot", {"thscodes": self.normalize_thscodes(thscodes)})

    def get_index_history(self, thscode: str, start: str | date | datetime | int, end: str | date | datetime | int, interval: str = "1d") -> dict:
        return self._get("/api/a-share-index/prices/historical", {"thscode": self.normalize_thscode(thscode), "interval": interval, "start": self.date_to_ms(start), "end": self.date_to_ms(end)})

    def get_limit_up_pool(self, trade_date: Optional[str] = None, page: int = 1, size: int = 50, sort_field: str = "limit_up_time", sort_dir: str = "desc") -> dict:
        return self._get("/api/a-share/special-data/limit-up-pool", {"trade_date": trade_date, "page": page, "size": size, "sort_field": sort_field, "sort_dir": sort_dir})

    def get_hot_stock_list(self, list_type: str = "hour", limit: int = 30) -> dict:
        return self._get("/api/a-share/special-data/hot-stock-list", {"period": list_type, "limit": limit})

    def get_skyrocket_list(self, list_type: str = "hour") -> dict:
        return self._get("/api/a-share/special-data/skyrocket-list", {"period": list_type})

    def get_hot_stock_rank_trend(self, thscode: str, start_date: str, end_date: str) -> dict:
        return self._get("/api/a-share/special-data/hot-stock-rank-trend", {"thscode": self.normalize_thscode(thscode), "start_date": start_date, "end_date": end_date})

    def get_anomaly_analysis_stock(self, thscodes: str | list[str]) -> dict:
        return self._get("/api/a-share/special-data/anomaly-analysis-stock", {"thscodes": self.normalize_thscodes(thscodes)})
