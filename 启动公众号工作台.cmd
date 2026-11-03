@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更高版本，再打开此文件。
  pause
  exit /b 1
)
echo 启动后请打开 http://127.0.0.1:4180
echo 使用期间请保持此窗口运行。关闭窗口即可停止程序。
node server.mjs
pause
