using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Launcher
{
    private const string Site = "https://teaminspectionproelite.github.io/INSPECTION-SERVICES/";

    [STAThread]
    private static void Main()
    {
        try
        {
            // Use a full browser profile so Drive OAuth, uploads and exports work.
            foreach (string folder in new[] { "ProgramFiles(x86)", "ProgramW6432", "ProgramFiles", "LOCALAPPDATA" })
            {
                string root = Environment.GetEnvironmentVariable(folder);
                if (String.IsNullOrEmpty(root)) continue;
                string edge = Path.Combine(root, @"Microsoft\Edge\Application\msedge.exe");
                if (File.Exists(edge))
                {
                    Process.Start(new ProcessStartInfo(edge, "--app=" + Site) { UseShellExecute = false });
                    return;
                }
            }
            Process.Start(new ProcessStartInfo(Site) { UseShellExecute = true });
        }
        catch (Exception)
        {
            MessageBox.Show("Open ProElite Inspection in your browser:\n" + Site,
                "ProElite Inspection", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
