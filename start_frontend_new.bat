@echo off
chcp 65001 >nul
echo 启动 A-Research React 前端...
cd /d D:\codeproject\fund-agent
cd frontend-web

REM node_modules 不能在 WSL/Linux 与 Windows Node.js 之间复用。
REM Rollup 原生模块缺失时自动清理并按当前平台重新安装。
if exist node_modules (
    node -e "require('rollup')" >nul 2>&1
    if errorlevel 1 (
        echo 检测到前端依赖与当前 Node.js 平台不兼容，正在重新安装...
        rmdir /s /q node_modules
    )
)

if not exist node_modules (
    echo 首次运行，正在安装前端依赖...
    call npm install
)
call npm run dev
