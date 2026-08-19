# -*- coding: utf-8 -*-
import glob
import os
import re
import zipfile

desk = os.path.join(os.environ["USERPROFILE"], "Desktop")
path = [
    p
    for p in glob.glob(os.path.join(desk, "*PR02(1).xlsx"))
    if not os.path.basename(p).startswith("~$")
][0]
print("file:", path)
z = zipfile.ZipFile(path)
print("=== custom.xml ===")
print(z.read("docProps/custom.xml").decode("utf-8"))

d = z.read("xl/drawings/drawing2.xml").decode("utf-8")
print("=== drawing2 BarCode snippets ===")
for m in re.finditer(r"name=\"BarCodeCtrl[^\"]*\"", d):
    start = max(0, m.start() - 120)
    end = min(len(d), m.end() + 250)
    print("---")
    print(d[start:end])

print("=== worksheet rels ===")
for n in z.namelist():
    if "worksheets/_rels" in n:
        print(n)
        print(z.read(n).decode("utf-8"))

# Look for barcode software hints in whole package
print("=== package text hits ===")
for n in z.namelist():
    if not n.endswith((".xml", ".rels", ".vml", ".txt")):
        continue
    data = z.read(n)
    for key in (b"BarCode", b"barcode", b"Bartender", b"Labeljoy", b"QRCode", b"ActiveBarcode"):
        if key in data:
            print(n, "contains", key)
            break
