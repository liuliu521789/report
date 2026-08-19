Attribute VB_Name = "ZhonglaiQR"
Option Explicit

' ============================================================
' 中来标签：一键刷新二维码（调用本机 Python，离线可用）
' 使用：改右侧 I~S → 保存 → Alt+F8 → RefreshZhonglaiQRCodes
' 或点击「刷新二维码」按钮
' ============================================================

Private Function PythonCmd() As String
    ' 优先用 py 启动器，其次 python
    Dim sh As Object, rc As Long
    Set sh = CreateObject("WScript.Shell")
    On Error Resume Next
    rc = sh.Run("cmd /c py -3 -c ""import qrcode,win32com.client""", 0, True)
    If rc = 0 Then
        PythonCmd = "py -3"
        Exit Function
    End If
    rc = sh.Run("cmd /c python -c ""import qrcode,win32com.client""", 0, True)
    If rc = 0 Then
        PythonCmd = "python"
        Exit Function
    End If
    PythonCmd = ""
End Function

Public Sub RefreshZhonglaiQRCodes()
    Dim sh As Object
    Dim py As String
    Dim script As String
    Dim cmd As String
    Dim rc As Long
    Dim bookName As String

    On Error GoTo ErrHandler

    If ActiveWorkbook Is Nothing Then
        MsgBox "请先打开标签工作簿。", vbExclamation, "中来标签"
        Exit Sub
    End If

    ' 先保存，保证 G 列公式已写入
    ActiveWorkbook.Save

    py = PythonCmd()
    If py = "" Then
        MsgBox "未检测到可用的 Python（需已安装 qrcode、pywin32）。" & vbCrLf & _
               "可在命令行执行：" & vbCrLf & _
               "  pip install qrcode pillow pywin32" & vbCrLf & _
               "或改用桌面「刷新中来标签二维码.bat」。", vbCritical, "中来标签"
        Exit Sub
    End If

    script = "d:\report\scripts\refresh-zhonglai-qrcodes.py"
    If Dir(script) = "" Then
        MsgBox "找不到脚本：" & script, vbCritical, "中来标签"
        Exit Sub
    End If

    bookName = ActiveWorkbook.Name
    ' --active：附加到当前已打开的 Excel，直接替换图片，不必关闭文件
    cmd = py & " " & Chr$(34) & script & Chr$(34) & _
          " --active --book " & Chr$(34) & bookName & Chr$(34)

    Set sh = CreateObject("WScript.Shell")
    ' 1=正常窗口，True=等待结束
    rc = sh.Run(cmd, 1, True)

    If rc = 0 Then
        MsgBox "二维码已按 G 列刷新完成。", vbInformation, "中来标签"
    Else
        MsgBox "刷新失败（退出码 " & rc & "）。" & vbCrLf & _
               "请查看弹出的黑色命令行窗口报错，或运行桌面 bat 试一次。", vbExclamation, "中来标签"
    End If
    Exit Sub

ErrHandler:
    MsgBox "宏运行出错：" & Err.Description & "（" & Err.Number & "）", vbCritical, "中来标签"
End Sub
