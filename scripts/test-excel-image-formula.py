# -*- coding: utf-8 -*-
import sys
import win32com.client

sys.stdout.reconfigure(encoding="utf-8")
excel = win32com.client.DispatchEx("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
print("Version", excel.Version)
print("Name", excel.Name)
wb = excel.Workbooks.Add()
ws = wb.Worksheets(1)

tests = [
    ('=ENCODEURL("test*1")', "ENCODEURL"),
    (
        '=IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=hello")',
        "IMAGE",
    ),
]
for formula, label in tests:
    try:
        ws.Range("A1").Clear()
        ws.Range("A1").Formula = formula
        excel.Calculate()
        print(label, "OK", "value=", repr(ws.Range("A1").Text)[:100])
    except Exception as e:
        print(label, "FAIL", e)

wb.Close(False)
excel.Quit()
