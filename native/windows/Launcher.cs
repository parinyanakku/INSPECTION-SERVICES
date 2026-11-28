using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Launcher
{
    private const string Site = "https://teaminspectionproelite.github.io/INSPECTION-SERVICES/";
    [STAThread] private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new WorkspaceWindow());
    }
    private sealed class WorkspaceWindow : Form
    {
        private readonly WebView2 view = new WebView2();
        private readonly Label status = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Text = "Opening ProElite Inspection..." };
        internal WorkspaceWindow()
        {
            Text = "ProElite Inspection";
            Width = 1280; Height = 820; MinimumSize = new Size(420, 360);
            Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            view.Dock = DockStyle.Fill; view.Visible = false;
            Controls.Add(view); Controls.Add(status);
            Shown += async (s, e) => await InitializeAsync();
        }
        private static bool WorkspaceUri(string raw)
        {
            Uri u;
            return Uri.TryCreate(raw, UriKind.Absolute, out u) && u.Scheme == "https" &&
                u.Host == "teaminspectionproelite.github.io" && u.IsDefaultPort &&
                u.UserInfo.Length == 0 && u.AbsolutePath.StartsWith("/INSPECTION-SERVICES/", StringComparison.Ordinal);
        }
        private async Task InitializeAsync()
        {
            try
            {
                // Independent application profile; never fall back to an external browser.
                string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ProElite Inspection Data", "WebView2");
                Directory.CreateDirectory(data);
                var env = await CoreWebView2Environment.CreateAsync(null, data);
                await view.EnsureCoreWebView2Async(env);
                var core = view.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreBrowserAcceleratorKeysEnabled = false;
                core.NavigationStarting += (s,e) => { if (!WorkspaceUri(e.Uri)) e.Cancel = true; };
                core.NewWindowRequested += (s,e) => { e.Handled = true; };
                core.NavigationCompleted += (s,e) => {
                    if (!e.IsSuccess && e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled) {
                        status.Text = "Cannot load ProElite. Check the internet connection and restart the app.\nไม่สามารถเปิดโปรแกรม กรุณาตรวจอินเทอร์เน็ตและเปิดใหม่";
                        status.Visible = true; view.Visible = false;
                    } else if (e.IsSuccess) { status.Visible = false; view.Visible = true; }
                };
                core.Navigate(Launcher.Site);
            }
            catch (Exception)
            {
                status.Text = "ProElite requires Microsoft WebView2 Runtime. Install or repair the runtime, then restart.\nกรุณาติดตั้งหรือซ่อมแซม WebView2 Runtime แล้วเปิดโปรแกรมใหม่";
            }
        }
    }
}
