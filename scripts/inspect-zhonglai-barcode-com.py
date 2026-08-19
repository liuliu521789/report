# -*- coding: utf-8 -*-
"""Inspect BarCodeCtrl shapes for linked-cell / data binding."""
import glob
import os

import win32com.client

desk = os.path.join(os.environ["USERPROFILE"], "Desktop")
path = [
    p
    for p in glob.glob(os.path.join(desk, "*PR02(1).xlsx"))
    if not os.path.basename(p).startswith("~$")
][0]

excel = win32com.client.DispatchEx("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
wb = excel.Workbooks.Open(path)
ws = None
for sh in wb.Worksheets:
    if "批次序列" in str(sh.Name):
        ws = sh
        break

print("sheet:", ws.Name)
# Dump first barcode shape properties
s = ws.Shapes(1)
print("Name", s.Name, "Type", s.Type)
for attr in [
    "OnAction",
    "AlternativeText",
    "Title",
    "ID",
    "Visible",
    "ZOrderPosition",
]:
    try:
        print(attr, getattr(s, attr))
    except Exception as e:
        print(attr, "ERR", e)

for prop in ["Fill", "Line", "TextFrame2", "Chart", "OLEFormat", "ControlFormat", "Hyperlink"]:
    try:
        obj = getattr(s, prop)
        print(prop, "OK", type(obj))
        if prop == "OLEFormat":
            print("  ProgID", obj.ProgID)
            print("  Object", obj.Object)
        if prop == "ControlFormat":
            print("  LinkedCell", obj.LinkedCell)
            print("  ListFillRange", obj.ListFillRange)
        if prop == "TextFrame2":
            try:
                print("  Text", obj.TextRange.Text)
            except Exception as e:
                print("  Text ERR", e)
    except Exception as e:
        print(prop, "ERR", e)

# Try ConnectorFormat / LinkFormat
for prop in ["ConnectorFormat", "LinkFormat", "PictureFormat", "ThreeD"]:
    try:
        obj = getattr(s, prop)
        print(prop, "OK")
        if prop == "LinkFormat":
            print("  SourceFullName", obj.SourceFullName)
            print("  AutoUpdate", obj.AutoUpdate)
    except Exception as e:
        print(prop, "ERR", e)

# Check if barcode add-in COM is registered
print("--- trying to list addins ---")
try:
    for i in range(1, excel.AddIns.Count + 1):
        a = excel.AddIns(i)
        print(i, a.Name, a.Installed, getattr(a, "FullName", ""))
except Exception as e:
    print("AddIns ERR", e)

# G2 formula value vs what first barcode might encode - check nearby cells
print("G2", ws.Range("G2").Text)
print("H2", ws.Range("H2").Text)

wb.Close(False)
excel.Quit()
