@echo off
chcp 65001 >nul
echo ============================================
echo A-Research - 启动后端服务
echo ============================================

:: 禁用代理（如果遇到网络问题）
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=

:: 激活虚拟环境并启动服务
call .\venv\Scripts\activate.bat
python -m uvicorn src.fund_agent.api:app --reload --host 0.0.0.0 --port 8003
