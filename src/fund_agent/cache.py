"""Redis 缓存模块"""

import json
import logging
from datetime import date, datetime, timedelta
from typing import Optional

import redis.asyncio as async_redis
import redis as sync_redis

from fund_agent.config import settings

logger = logging.getLogger(__name__)


class JSONEncoder(json.JSONEncoder):
    """自定义 JSON 编码器，支持日期类型"""

    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        return super().default(obj)


def json_dumps(obj: dict) -> str:
    """JSON 序列化，支持日期类型"""
    return json.dumps(obj, ensure_ascii=False, cls=JSONEncoder)


class CacheManager:
    """Redis 缓存管理器（支持同步和异步）"""

    def __init__(self):
        self._async_client: Optional[async_redis.Redis] = None
        self._sync_client: Optional[sync_redis.Redis] = None
        self._enabled = settings.CACHE_ENABLED
        self._ttl = settings.CACHE_TTL

    async def init(self):
        """初始化 Redis 连接"""
        if not self._enabled:
            logger.info("Cache is disabled")
            return

        try:
            # 异步客户端
            self._async_client = async_redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=2,
            )
            # 同步客户端供同步数据源调用。
            self._sync_client = sync_redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=2,
            )
            # 测试连接
            await self._async_client.ping()
            logger.info(f"Redis connected: {settings.REDIS_URL}")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}, caching disabled")
            self._enabled = False
            self._async_client = None
            self._sync_client = None

    async def close(self):
        """关闭 Redis 连接"""
        if self._async_client:
            await self._async_client.close()
        if self._sync_client:
            self._sync_client.close()
        logger.info("Redis connection closed")

    # ==================== 异步方法 ====================

    async def get(self, key: str) -> Optional[dict]:
        """获取缓存（异步）

        Args:
            key: 缓存键

        Returns:
            缓存的字典数据，不存在返回 None
        """
        if not self._enabled or not self._async_client:
            return None

        try:
            value = await self._async_client.get(key)
            if value:
                logger.debug(f"Cache hit: {key}")
                return json.loads(value)
            logger.debug(f"Cache miss: {key}")
            return None
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None

    async def set(
        self,
        key: str,
        value: dict,
        ttl: Optional[int] = None,
    ) -> bool:
        """设置缓存（异步）

        Args:
            key: 缓存键
            value: 要缓存的字典数据
            ttl: 过期时间（秒），默认使用配置的 TTL

        Returns:
            是否成功
        """
        if not self._enabled or not self._async_client:
            return False

        try:
            ttl = ttl or self._ttl
            await self._async_client.setex(
                key,
                timedelta(seconds=ttl),
                json_dumps(value),
            )
            logger.debug(f"Cache set: {key}, TTL: {ttl}s")
            return True
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """删除缓存（异步）"""
        if not self._enabled or not self._async_client:
            return False

        try:
            await self._async_client.delete(key)
            logger.debug(f"Cache deleted: {key}")
            return True
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """检查缓存是否存在（异步）"""
        if not self._enabled or not self._async_client:
            return False

        try:
            return await self._async_client.exists(key) > 0
        except Exception as e:
            logger.error(f"Cache exists error: {e}")
            return False

    # ==================== 同步方法 ====================

    def get_sync(self, key: str) -> Optional[dict]:
        """获取缓存（同步）

        用于同步数据源调用。
        """
        if not self._enabled or not self._sync_client:
            return None

        try:
            value = self._sync_client.get(key)
            if value:
                logger.debug(f"Cache hit (sync): {key}")
                return json.loads(value)
            logger.debug(f"Cache miss (sync): {key}")
            return None
        except Exception as e:
            logger.error(f"Cache get_sync error: {e}")
            return None

    def set_sync(
        self,
        key: str,
        value: dict,
        ttl: Optional[int] = None,
    ) -> bool:
        """设置缓存（同步）"""
        if not self._enabled or not self._sync_client:
            return False

        try:
            ttl = ttl or self._ttl
            self._sync_client.setex(
                key,
                timedelta(seconds=ttl),
                json_dumps(value),
            )
            logger.debug(f"Cache set (sync): {key}, TTL: {ttl}s")
            return True
        except Exception as e:
            logger.error(f"Cache set_sync error: {e}")
            return False

    def delete_sync(self, key: str) -> bool:
        """删除缓存（同步）"""
        if not self._enabled or not self._sync_client:
            return False

        try:
            self._sync_client.delete(key)
            logger.debug(f"Cache deleted (sync): {key}")
            return True
        except Exception as e:
            logger.error(f"Cache delete_sync error: {e}")
            return False

    # ==================== 辅助方法 ====================

    @staticmethod
    def make_key(prefix: str, *args) -> str:
        """生成缓存键

        Args:
            prefix: 数据类型键前缀。
            *args: 其他参数

        Returns:
            完整的缓存键，格式：prefix:arg1:arg2:...
        """
        parts = [prefix] + [str(arg) for arg in args if arg]
        return ":".join(parts)

    @property
    def enabled(self) -> bool:
        """缓存是否启用"""
        return self._enabled


# 全局缓存管理器实例
cache = CacheManager()
