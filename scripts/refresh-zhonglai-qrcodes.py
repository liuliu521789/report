# -*- coding: utf-8 -*-
"""
按 Sheet2 右侧 G 列重新生成左侧二维码图片。

用法：
  python scripts/refresh-zhonglai-qrcodes.py
  python scripts/refresh-zhonglai-qrcodes.py --src "C:\\path\\file.xlsx"
  python scripts/refresh-zhonglai-qrcodes.py --active          # 刷新当前已打开的工作簿（给宏用）
  python scripts/refresh-zhonglai-qrcodes.py --active --book "中来标签 - PR02-fixed-qr.xlsm"
"""
from __future__ import annotations

import argparse
import glob
import os
import sys
import tempfile

import qrcode
import win32com.client


LABEL_START_TO_G_ROW = {
    2: 2,
    9: 3,
    16: 4,
    23: 5,
    30: 6,
    37: 7,
    44: 8,
    51: 9,
    58: 10,
    65: 11,
    71: 12,
    77: 13,
    83: 14,
    89: 15,
    95: 16,
    101: 17,
    107: 18,
    113: 19,
    119: 20,
    125: 21,
}

MSO_PICTURE = 13


def find_default_src() -> str:
    desk = os.path.join(os.environ["USERPROFILE"], "Desktop")
    for pat in ("*PR02*fixed-qr.xlsm", "*PR02*fixed-qr.xlsx", "*PR02*fixed.xlsx", "*PR02*.xlsx"):
        files = [
            p
            for p in glob.glob(os.path.join(desk, pat))
            if not os.path.basename(p).startswith("~$")
        ]
        if files:
            return max(files, key=os.path.getmtime)
    raise FileNotFoundError("桌面未找到 PR02 工作簿")


# 图片相对原框内缩（磅），避免紧贴表格线
QR_INSET_PT = 5.0


def make_qr_png(text: str, path: str, box_size: int = 8, border: int = 4) -> None:
    """border=4 为二维码标准静区，四周留白更清晰。"""
    img = qrcode.make(
        text,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    img.save(path)


def fit_qr_box(left: float, top: float, width: float, height: float, inset: float = QR_INSET_PT):
    """在原矩形内居中内缩，并保持正方形，避免贴边。"""
    pad = max(2.0, min(inset, width / 6.0, height / 6.0))
    inner_w = max(12.0, width - 2 * pad)
    inner_h = max(12.0, height - 2 * pad)
    side = min(inner_w, inner_h)
    new_left = left + (width - side) / 2.0
    new_top = top + (height - side) / 2.0
    return new_left, new_top, side, side


def find_batch_sheet(wb):
    for sh in wb.Worksheets:
        if "批次序列" in str(sh.Name):
            return sh
    return wb.Worksheets(2) if wb.Worksheets.Count >= 2 else wb.Worksheets(1)


def is_empty_payload(payload: str) -> bool:
    p = (payload or "").strip()
    if not p or p.startswith("#") or p.startswith("="):
        return True
    return p.replace("*", "") in {"", "MBGCHPSTD"}


def refresh_worksheet(ws) -> tuple[int, int]:
    """Replace barcode pictures on worksheet from column G. Returns (updated, skipped)."""
    ws.Calculate()
    pics = []
    for i in range(1, ws.Shapes.Count + 1):
        s = ws.Shapes(i)
        if int(s.Type) != MSO_PICTURE:
            continue
        name = str(s.Name)
        if not (name.startswith("BarCodeCtrl") or name.startswith("QR")):
            continue
        row = int(s.TopLeftCell.Row)
        # 先按精确行映射；对不上时后面按垂直顺序兜底
        pics.append(
            {
                "name": name,
                "row": row,
                "g_row": LABEL_START_TO_G_ROW.get(row),
                "left": float(s.Left),
                "top": float(s.Top),
                "width": float(s.Width),
                "height": float(s.Height),
                "shape": s,
            }
        )

    # 锚点行常会偏移 1～2 行：按从上到下顺序对应 G2..Gn 更稳
    pics_sorted = sorted(pics, key=lambda p: (p["top"], p["left"]))
    g_seq = list(range(2, 2 + len(pics_sorted)))
    for idx, p in enumerate(pics_sorted):
        if not p["g_row"]:
            # 就近匹配标签起始行
            nearest = min(LABEL_START_TO_G_ROW.keys(), key=lambda r: abs(r - p["row"]))
            if abs(nearest - p["row"]) <= 3:
                p["g_row"] = LABEL_START_TO_G_ROW[nearest]
            else:
                p["g_row"] = g_seq[idx]

    print(f"sheet={ws.Name} pictures={len(pics)}")
    updated = 0
    skipped = 0
    tmp_files: list[str] = []
    try:
        for p in pics_sorted:
            if not p["g_row"]:
                print(f"  skip {p['name']} @ row {p['row']}: no G mapping")
                skipped += 1
                continue
            payload = str(ws.Range(f"G{p['g_row']}").Text or "").strip()
            if is_empty_payload(payload):
                print(f"  skip {p['name']}: empty G{p['g_row']}={payload!r}")
                skipped += 1
                continue

            fd, png = tempfile.mkstemp(prefix="zlqr_", suffix=".png")
            os.close(fd)
            tmp_files.append(png)
            make_qr_png(payload, png)

            left, top, width, height = fit_qr_box(
                p["left"], p["top"], p["width"], p["height"]
            )
            old_name = p["name"]
            p["shape"].Delete()
            pic = ws.Shapes.AddPicture(png, False, True, left, top, width, height)
            try:
                pic.Name = old_name
            except Exception:
                pass
            print(f"  OK {old_name} (row {p['row']}) <- G{p['g_row']}: {payload[:70]}")
            updated += 1

        # remove hidden placeholders
        to_del = []
        for i in range(1, ws.Shapes.Count + 1):
            s = ws.Shapes(i)
            if int(s.Type) == 1 and str(s.Name).startswith("BarCodeCtrl"):
                to_del.append(s)
        for s in to_del:
            try:
                s.Delete()
            except Exception:
                pass
    finally:
        for f in tmp_files:
            try:
                os.remove(f)
            except OSError:
                pass
    return updated, skipped


def refresh_active(book_name: str | None = None) -> None:
    excel = win32com.client.GetObject(Class="Excel.Application")
    wb = None
    if book_name:
        target = book_name.strip().lower()
        for b in excel.Workbooks:
            if str(b.Name).lower() == target or str(b.FullName).lower().endswith(target):
                wb = b
                break
        if wb is None:
            raise FileNotFoundError(f"未在已打开的工作簿中找到: {book_name}")
    else:
        wb = excel.ActiveWorkbook
    if wb is None:
        raise RuntimeError("没有活动的工作簿，请先打开标签 xlsm/xlsx")

    print("active book:", wb.FullName)
    excel.ScreenUpdating = False
    try:
        ws = find_batch_sheet(wb)
        updated, skipped = refresh_worksheet(ws)
        wb.Save()
        print(f"updated={updated} skipped={skipped} saved in-place")
    finally:
        excel.ScreenUpdating = True


def refresh_file(src: str, out: str | None = None) -> str:
    if out is None:
        base, ext = os.path.splitext(src)
        if base.endswith("-fixed"):
            out = base + "-qr" + ext
        else:
            out = base + "-qr" + ext

    excel = win32com.client.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.ScreenUpdating = False
    wb = None
    try:
        wb = excel.Workbooks.Open(os.path.abspath(src))
        ws = find_batch_sheet(wb)
        updated, skipped = refresh_worksheet(ws)
        if os.path.exists(out):
            try:
                os.remove(out)
            except OSError:
                pass
        wb.SaveAs(os.path.abspath(out))
        print(f"updated={updated} skipped={skipped}")
        print("saved:", out)
        return out
    finally:
        if wb is not None:
            wb.Close(SaveChanges=False)
        excel.ScreenUpdating = True
        excel.Quit()


def main():
    ap = argparse.ArgumentParser(description="按 G 列刷新中来标签 Sheet2 二维码图片")
    ap.add_argument("src_pos", nargs="?", default=None, help="源文件（可拖拽）")
    ap.add_argument("--src", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--inplace", action="store_true")
    ap.add_argument("--open", action="store_true")
    ap.add_argument(
        "--active",
        action="store_true",
        help="刷新当前 Excel 中已打开的工作簿（供宏调用，无需关闭文件）",
    )
    ap.add_argument("--book", default=None, help="配合 --active，指定工作簿文件名")
    args = ap.parse_args()

    try:
        if args.active:
            refresh_active(args.book)
            return
        src = args.src or args.src_pos or find_default_src()
        print("src:", src)
        out = src if args.inplace else args.out
        result = refresh_file(src, out)
        if args.open and result:
            os.startfile(result)
    except Exception as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
