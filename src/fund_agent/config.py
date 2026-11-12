"""配置管理"""

import os
from pathlib import Path

from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv(Path(__file__).parent.parent.parent / ".env")


def _fix_invalid_ssl_cert_env() -> None:
    """修正 Conda/系统遗留的无效 SSL 证书环境变量。

    httpx/openai 会优先读取 SSL_CERT_FILE。若该变量指向不存在的文件，
    ChatOpenAI 初始化会抛 FileNotFoundError。
    """
    for env_name in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"):
        cert_path = os.getenv(env_name)
        if cert_path and not Path(cert_path).exists():
            try:
                import certifi

                os.environ[env_name] = certifi.where()
            except Exception:
                os.environ.pop(env_name, None)


_fix_invalid_ssl_cert_env()


class Settings:
    """应用配置"""

    # LLM 配置
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # Redis 配置
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # 数据源配置
    FUYAO_API_KEY: str = (
        os.getenv("HITHINK_FINANCE_API_KEY", "")
        or os.getenv("FUYAO_API_KEY", "")
        or os.getenv("FUYAO_TOKEN", "")
    )

    # 缓存配置
    CACHE_ENABLED: bool = os.getenv("CACHE_ENABLED", "true").lower() == "true"
    CACHE_TTL: int = int(os.getenv("CACHE_TTL", "3600"))  # 1 小时

    # SQLite 持久化路径（关注列表等用户数据）。留空使用默认 data/app.db。
    APP_DB_PATH: str = os.getenv("APP_DB_PATH", "")

    @property
    def llm_config(self) -> dict:
        """获取 LLM 配置"""
        return {
            "api_key": self.OPENAI_API_KEY,
            "base_url": self.OPENAI_BASE_URL,
            "model": self.OPENAI_MODEL,
        }


settings = Settings()

