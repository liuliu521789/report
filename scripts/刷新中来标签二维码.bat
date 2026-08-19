@echo off
chcp 65001 >nul
title 中来标签 - 刷新二维码
cd /d d:\report

echo.
echo ========================================
echo   中来标签 Sheet2 二维码刷新
echo ========================================
echo.
echo 步骤：
echo   1. 在 Excel 改右侧表格（I~S 列），G 列会自动算二维码内容
echo   2. 保存并关闭该 xlsx
echo   3. 把文件拖到本窗口/本 bat 上，或直接双击用桌面最新 PR02
echo.

set "SRC=%~1"
if "%SRC%"=="" (
  echo 未拖入文件，自动选用桌面最新 PR02...
  python "d:\report\scripts\refresh-zhonglai-qrcodes.py" --open
) else (
  echo 源文件: %SRC%
  python "d:\report\scripts\refresh-zhonglai-qrcodes.py" "%SRC%" --open
)

if errorlevel 1 (
  echo.
  echo 失败。请确认：
  echo   - 已关闭 Excel 中的该文件
  echo   - 已安装: pip install qrcode pillow pywin32
  pause
  exit /b 1
)

echo.
pause
