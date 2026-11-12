@echo off
chcp 65001 >nul
echo ========================================
echo    A 股研究系统启动器
echo ========================================
echo.

REM 检查 Redis
echo [1/4] 检查 Redis 服务...
docker ps --filter name=redis-fund --format "{{.Names}}: {{.Status}}" 2>nul | findstr "Up" >nul
if errorlevel 1 (
    echo Redis 未运行，正在启动...
    docker start redis-fund 2>nul
    timeout /t 2 /nobreak >nul
)
echo Redis: 已就绪
echo.

REM 启动后端
echo [2/4] 启动后端服务 (端口: 8003)...
start "A-Research - 后端" cmd /k "cd /d D:\codeproject\fund-agent && venv\Scripts\activate && python -m uvicorn src.fund_agent.api:app --reload --port 8003"
timeout /t 3 /nobreak >nul
echo 后端服务: 启动中...
echo.

REM 等待后端完全启动
echo [3/4] 等待后端服务就绪...
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:8003/docs >nul 2>&1
if errorlevel 1 (
    echo 等待后端启动...
    goto wait_backend
)
echo 后端服务: 已就绪
echo.

REM 启动前端
echo [4/4] 启动 React 前端服务 (端口: 5173)...
start "A-Research - 前端" cmd /k "cd /d D:\codeproject\fund-agent\frontend-web && if not exist node_modules call npm install && npm run dev"
timeout /t 2 /nobreak >nul
echo 前端服务: 启动中...
echo.

echo ========================================
echo    系统启动完成！
echo ========================================
echo.
echo 📊 前端地址: http://localhost:5173
echo 🔌 后端地址: http://localhost:8003
echo 📖 API 文档: http://localhost:8003/docs
echo.
echo 提示：
echo 1. 浏览器访问 http://localhost:5173
echo 2. 如果前端打开但无法查询，请等待几秒钟让后端完全启动
echo 3. 查看后端终端窗口了解详细日志
echo.
echo 按任意键退出此窗口...
pause >nul
