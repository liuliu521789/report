# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r"e:\Office 2024 软件包\MAS_AIO_中文.cmd")
text = p.read_bytes().decode("gbk")
reps = [
    (
        'choice /C:10 /N /M ">    [1] Activate Anyway [0] %_exitmsg% : "',
        'choice /C:10 /N /M ">    [1] 仍然激活 [0] %_exitmsg% : "',
    ),
    (
        '$Host.UI.RawUI.WindowTitle = "Check Activation Status"',
        '$Host.UI.RawUI.WindowTitle = "检查激活状态"',
    ),
]
for a, b in reps:
    c = text.count(a)
    print(c, a[:50])
    text = text.replace(a, b)
p.write_bytes(text.encode("gbk"))
print("patched", p)
