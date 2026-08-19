# -*- coding: utf-8 -*-
"""把 ZhonglaiQR 宏打进中来标签工作簿，另存为 .xlsm，并加按钮。"""
from __future__ import annotations

import glob
import os
import sys
import tempfile

import win32com.client

DESK = os.path.join(os.environ["USERPROFILE"], "Desktop")
BAS = r"d:\report\scripts\ZhonglaiQR.bas"


def find_src() -> str:
    cands = []
    for pat in ("*PR02*fixed-qr.xlsx", "*PR02*fixed.xlsx", "*PR02*.xlsx"):
        cands = [
            p
            for p in glob.glob(os.path.join(DESK, pat))
            if not os.path.basename(p).startswith("~$")
        ]
        if cands:
            break
    if not cands:
        raise FileNotFoundError("桌面未找到 PR02 xlsx")
    return max(cands, key=os.path.getmtime)


def main():
    src = find_src()
    out = os.path.join(DESK, "中来标签 - PR02-宏刷新.xlsm")
    print("src:", src)
    print("out:", out)

    with open(BAS, "r", encoding="utf-8") as f:
        raw = f.read()
    # strip VB Attribute line for Import; keep as file
    bas_tmp = os.path.join(tempfile.gettempdir(), "ZhonglaiQR_import.bas")
    with open(bas_tmp, "w", encoding="utf-8", newline="\r\n") as f:
        f.write(raw)

    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    wb = None
    try:
        # 允许访问 VBA 工程
        try:
            excel.VBE.MainWindow.Visible = False
        except Exception:
            pass

        wb = excel.Workbooks.Open(os.path.abspath(src))
        vbproj = wb.VBProject

        # 删除旧模块
        for comp in list(vbproj.VBComponents):
            if comp.Name == "ZhonglaiQR":
                vbproj.VBComponents.Remove(comp)

        vbproj.VBComponents.Import(bas_tmp)

        # 在「批次序列」表左上角放按钮
        ws = None
        for sh in wb.Worksheets:
            if "批次序列" in str(sh.Name):
                ws = sh
                break
        if ws is None:
            ws = wb.Worksheets(2)

        # 删旧按钮
        for s in list(ws.Shapes):
            try:
                if str(s.Name).startswith("btnRefreshQR"):
                    s.Delete()
            except Exception:
                pass

        btn = ws.Buttons.Add(100, 5, 140, 28)
        btn.Name = "btnRefreshQR"
        btn.Characters.Text = "刷新二维码"
        btn.OnAction = "RefreshZhonglaiQRCodes"

        # 提示单元格
        ws.Range("F1").Value = "改右侧表后点「刷新二维码」"
        ws.Range("F1").Font.Color = 0x0000C0

        if os.path.exists(out):
            os.remove(out)
        # 52 = xlOpenXMLWorkbookMacroEnabled
        wb.SaveAs(os.path.abspath(out), FileFormat=52)
        print("saved:", out)
        print("OK: 打开 xlsm → 启用宏 → 点「刷新二维码」")
    except Exception as e:
        msg = str(e)
        print("FAILED:", type(e).__name__, msg)
        if "信任" in msg or "programmatic" in msg.lower() or "VBProject" in msg or "-214" in msg:
            print(
                "\n请先在 Excel 中开启：\n"
                "  文件 → 选项 → 信任中心 → 信任中心设置 → 宏设置\n"
                "  勾选「信任对 VBA 项目对象模型的访问」\n"
                "然后重新运行本脚本。\n"
                "或手动：Alt+F11 → 文件 → 导入文件 → ZhonglaiQR.bas"
            )
        sys.exit(1)
    finally:
        if wb is not None:
            wb.Close(SaveChanges=False)
        excel.Quit()
        try:
            os.remove(bas_tmp)
        except OSError:
            pass


if __name__ == "__main__":
    main()
