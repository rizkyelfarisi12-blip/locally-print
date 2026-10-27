' Menjalankan LocalPrint tanpa jendela console dan menyalakannya lagi bila berhenti.
' Dipanggil oleh Task Scheduler (dipasang install.bat). Hentikan lewat: schtasks /end /tn "LocalPrint"
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
node = "node"
If fso.FileExists(here & "\node.path") Then
  Set f = fso.OpenTextFile(here & "\node.path", 1)
  If Not f.AtEndOfStream Then node = Trim(f.ReadLine())
  f.Close
End If
q = Chr(34)
cmd = "cmd /c " & q & q & node & q & " server.js >> run.log 2>&1" & q
fails = 0
Do
  t = Timer
  sh.Run cmd, 0, True
  If Timer - t < 20 Then fails = fails + 1 Else fails = 0
  If fails >= 5 Then WScript.Sleep 300000 Else WScript.Sleep 5000
Loop
