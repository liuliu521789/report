# -*- coding: utf-8 -*-
"""Create Chinese UI overlay of MAS_AIO.cmd (menus + common prompts)."""
from __future__ import annotations

import re
from pathlib import Path

SRC = Path(r"e:\Office 2024 软件包\MAS_AIO.cmd")
DST = Path(r"e:\Office 2024 软件包\MAS_AIO_中文.cmd")

# Order matters for some overlapping phrases — longer first
REPLACEMENTS: list[tuple[str, str]] = [
    # titles / common exit
    ("title  Microsoft %blank%Activation %blank%Scripts %masver%", "title  微软激活脚本 MAS %masver%  [中文界面]"),
    ("title  Microsoft_Activation_Scripts %masver%", "title  微软激活脚本 MAS %masver%  [中文界面]"),
    ('set "_exitmsg=Go back"', 'set "_exitmsg=返回"'),
    ('set "_exitmsg=Exit"', 'set "_exitmsg=退出"'),
    (
        'set "_fixmsg=Go back to Main Menu, select Troubleshoot and run Fix Licensing option."',
        'set "_fixmsg=请返回主菜单，选择「故障排除」并运行「修复许可」选项。"',
    ),
    (
        'set "_fixmsg=In MAS folder, run Troubleshoot script and select Fix Licensing option."',
        'set "_fixmsg=请在 MAS 中运行「故障排除」，并选择「修复许可」选项。"',
    ),
    # main tip
    (
        'call :dk_color2 %_Green% "       Tip:" %_White% " To activate ESU updates after W10 EOL, use TSforge option."',
        'call :dk_color2 %_Green% "       提示:" %_White% " Win10 结束支持后如需 ESU 更新，请使用 TSforge 选项。"',
    ),
    # menus
    ("echo:                 Activation Methods:", "echo:                 激活方法:"),
    ('call :dk_color3 %_White% "             [1] " %_Green% "HWID" %_White% "                - Windows"',
     'call :dk_color3 %_White% "             [1] " %_Green% "HWID" %_White% "                - Windows 永久"'),
    ("echo:             [1] HWID                - Windows", "echo:             [1] HWID                - Windows 永久"),
    ('call :dk_color3 %_White% "             [2] " %_Green% "Ohook" %_White% "               - Office"',
     'call :dk_color3 %_White% "             [2] " %_Green% "Ohook" %_White% "               - Office 永久"'),
    ("echo:             [2] Ohook               - Office", "echo:             [2] Ohook               - Office 永久"),
    (
        'call :dk_color3 %_White% "             [3] " %_Green% "TSforge" %_White% "             - Windows / Office / ESU"',
        'call :dk_color3 %_White% "             [3] " %_Green% "TSforge" %_White% "             - Windows / Office / ESU"',
    ),
    ("echo:             [3] TSforge             - Windows / Office / ESU", "echo:             [3] TSforge             - Windows / Office / ESU"),
    ("echo:             [4] Online KMS          - Windows / Office", "echo:             [4] 在线 KMS            - Windows / Office"),
    ("echo:             [5] Check Activation Status", "echo:             [5] 检查激活状态"),
    ("echo:             [6] Change Windows Edition", "echo:             [6] 更改 Windows 版本"),
    ("echo:             [7] Change Office Edition", "echo:             [7] 更改 Office 版本"),
    ("echo:             [8] Troubleshoot", "echo:             [8] 故障排除"),
    ("echo:             [E] Extras", "echo:             [E] 附加功能"),
    ("echo:             [H] Help", "echo:             [H] 帮助"),
    ("echo:             [0] Exit", "echo:             [0] 退出"),
    (
        'call :dk_color2 %_White% "         " %_Green% "Choose a menu option using your keyboard [1,2,3...E,H,0] :"',
        'call :dk_color2 %_White% "         " %_Green% "请用键盘选择菜单项 [1,2,3...E,H,0]："',
    ),
    # extras
    ("title  Extras", "title  附加功能"),
    ("echo:                [1] Extract $OEM$ Folder", "echo:                [1] 提取 $OEM$ 文件夹"),
    ("echo:                [2] Download Genuine Windows / Office ", "echo:                [2] 下载正版 Windows / Office "),
    ("echo:                [0] Go to Main Menu", "echo:                [0] 返回主菜单"),
    (
        'call :dk_color2 %_White% "             " %_Green% "Choose a menu option using your keyboard [1,2,0] :"',
        'call :dk_color2 %_White% "             " %_Green% "请用键盘选择菜单项 [1,2,0]："',
    ),
    # OEM extract
    ("title  Extract $OEM$ Folder", "title  提取 $OEM$ 文件夹"),
    ("echo $OEM$ folder already exists on the Desktop.", "echo 桌面上已存在 $OEM$ 文件夹。"),
    ("echo:                     Extract $OEM$ folder on the desktop           ", "echo:                     在桌面提取 $OEM$ 文件夹           "),
    ('call :dk_color2 %_White% "            [R] " %_Green% "ReadMe"', 'call :dk_color2 %_White% "            [R] " %_Green% "说明文档"'),
    ("echo:            [0] Go Back", "echo:            [0] 返回"),
    (
        'call :dk_color2 %_White% "             " %_Green% "Choose a menu option using your keyboard :"',
        'call :dk_color2 %_White% "             " %_Green% "请用键盘选择菜单项："',
    ),
    # common prompts
    ('call :dk_color %_Yellow% "Press [0] key to %_exitmsg%..."', 'call :dk_color %_Yellow% "按 [0] 键%_exitmsg%..."'),
    ('call :dk_color %_Yellow% "Press any key to %_exitmsg%..."', 'call :dk_color %_Yellow% "按任意键%_exitmsg%..."'),
    (
        'call :dk_color2 %Blue% "Press [1] to Open Support Webpage " %Gray% " Press [0] to Ignore"',
        'call :dk_color2 %Blue% "按 [1] 打开支持网页 " %Gray% " 按 [0] 忽略"',
    ),
    ('choice /N /M ">    [1] Activate Anyway [0] %_exitmsg% : "', 'choice /N /M ">    [1] 仍然激活 [0] %_exitmsg% : "'),
    (
        'call :dk_color %Blue% "Go back to Main Menu, select Troubleshoot and run DISM Restore and SFC Scan options."',
        'call :dk_color %Blue% "请返回主菜单，选择「故障排除」并运行 DISM 还原 与 SFC 扫描。"',
    ),
    (
        'call :dk_color %Blue% "If it still does not work, go back to Main Menu, select Troubleshoot and run Fix WPA Registry option."',
        'call :dk_color %Blue% "若仍无效，请返回主菜单，选择「故障排除」并运行「修复 WPA 注册表」。"',
    ),
    (
        'call :dk_color %Blue% "Go back to Main Menu, select Troubleshoot and run Fix WMI option."',
        'call :dk_color %Blue% "请返回主菜单，选择「故障排除」并运行「修复 WMI」。"',
    ),
    (
        'call :dk_color %Blue% "Go back to Main Menu, select Troubleshoot and run Fix WPA Registry option."',
        'call :dk_color %Blue% "请返回主菜单，选择「故障排除」并运行「修复 WPA 注册表」。"',
    ),
    ("echo Unable to detect Desktop location, aborting...", "echo 无法检测桌面位置，正在中止..."),
    ("echo Null service is not running, script may crash...", "echo Null 服务未运行，脚本可能崩溃..."),
    (
        "echo Error - Script either has LF line ending issue or an empty line at the end of the script is missing.",
        "echo 错误 - 脚本存在 LF 换行问题，或文件末尾缺少空行。",
    ),
    ("echo Check this webpage for help - %mas%fix_service", "echo 帮助页面 - %mas%fix_service"),
    ("echo Check this webpage for help - %mas%troubleshoot", "echo 帮助页面 - %mas%troubleshoot"),
    ('set "nceline=echo: &echo ==== ERROR ==== &echo:"', 'set "nceline=echo: &echo ==== 错误 ==== &echo:"'),
    ('set "eline=echo: &call :dk_color %Red% "==== ERROR ====" &echo:"', 'set "eline=echo: &call :dk_color %Red% "==== 错误 ====" &echo:"'),
    ("echo Checking OS Info", "echo 正在检查系统信息"),
    ("title  HWID Activation %masver%", "title  HWID 激活 %masver%"),
    ("title  Ohook Activation %masver%", "title  Ohook 激活 %masver%"),
    ("title  Online KMS Activation %masver%", "title  在线 KMS 激活 %masver%"),
    ("title  TSforge Activation %masver%", "title  TSforge 激活 %masver%"),
    ("title  Troubleshoot", "title  故障排除"),
    ("title  Change Windows Edition", "title  更改 Windows 版本"),
    ("title  Change Office Edition", "title  更改 Office 版本"),
    ("title  Check Activation Status", "title  检查激活状态"),
]


def main() -> None:
    # 原文件多为 UTF-8/ASCII；中文 Windows 的 cmd 用 GBK 显示更稳
    raw = SRC.read_bytes()
    text = raw.decode("utf-8", errors="surrogateescape")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    n = 0
    for en, zh in REPLACEMENTS:
        c = text.count(en)
        if c:
            text = text.replace(en, zh)
            n += c
            print(f"  {c:4d}  {en[:60]!r}")
        else:
            print(f"  miss  {en[:60]!r}")
    # MAS 脚本要求 CRLF 行尾
    out = text.replace("\n", "\r\n").encode("gbk", errors="surrogateescape")
    DST.write_bytes(out)
    print(f"\nreplaced hits={n}")
    print("saved:", DST)
    print("size:", DST.stat().st_size)


if __name__ == "__main__":
    main()
