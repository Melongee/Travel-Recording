$ErrorActionPreference = 'Stop'
if ([System.Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) { Write-Output 'NO_DESKTOP'; exit 2 }
# Native IFileOpenDialog in folder mode. Only a path is returned; no file contents are read or uploaded.
$helper = Join-Path ([IO.Path]::GetTempPath()) ('TravelRecordingFolderPicker-' + [Guid]::NewGuid().ToString('N') + '.exe')
$child = $null
try {
Add-Type -OutputAssembly $helper -OutputType WindowsApplication -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TravelFolderDialog {
    [STAThread] public static void Main() {
        try {
            string selected=Choose(Environment.GetEnvironmentVariable("TRAVEL_RECORDING_PICK_FILE")=="1");
            Console.WriteLine(selected==null ? "CANCELLED" : "SELECTED:"+Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(selected)));
        } catch { Environment.Exit(3); }
    }
    [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")] class FileOpenDialog {}
    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileDialog {
        [PreserveSig] int Show(IntPtr owner);
        void SetFileTypes(uint count, IntPtr filters);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem folder);
        void SetFolder(IShellItem folder);
        void GetFolder(out IShellItem folder);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
    }
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem {
        void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint type, out IntPtr name);
    }
    public static string Choose(bool file) {
        IFileDialog dialog=(IFileDialog)new FileOpenDialog();
        IShellItem item=null;
        IntPtr name=IntPtr.Zero;
        try {
            uint options; dialog.GetOptions(out options);
            // PICKFOLDERS | FORCEFILESYSTEM | PATHMUSTEXIST | DONTADDTORECENT
            dialog.SetOptions(options | (file ? 0x1000u : 0x20u) | 0x40u | 0x800u | 0x02000000u);
            dialog.SetTitle(file ? "选择照片文件 — 旅迹" : "选择照片目录 — 旅迹");
            dialog.SetOkButtonLabel(file ? "选择此照片" : "选择此文件夹");
            // The browser is a separate process; use an independent desktop dialog.
            int result=dialog.Show(IntPtr.Zero);
            if(result==unchecked((int)0x800704C7))return null;
            Marshal.ThrowExceptionForHR(result);
            dialog.GetResult(out item);
            item.GetDisplayName(0x80058000u, out name); // SIGDN_FILESYSPATH
            return Marshal.PtrToStringUni(name);
        } finally {
            if(name!=IntPtr.Zero)Marshal.FreeCoTaskMem(name);
            if(item!=null)Marshal.ReleaseComObject(item);
            Marshal.ReleaseComObject(dialog);
        }
    }
}
'@
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $helper
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $child = [Diagnostics.Process]::Start($info)
    $result = $child.StandardOutput.ReadToEnd()
    $child.WaitForExit()
    if ($child.ExitCode -ne 0) { exit 3 }
    Write-Output $result.Trim()
} catch { exit 3 }
finally {
    if ($null -ne $child) { $child.Dispose() }
    if (Test-Path -LiteralPath $helper) { Remove-Item -LiteralPath $helper -Force -ErrorAction SilentlyContinue }
}
