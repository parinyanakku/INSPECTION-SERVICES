using System;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
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
        // Pilot: sign only the dedicated protocol's fixed-size server challenge.
        // No private key material is returned to the WebView.
        private void DeviceProof(CoreWebView2 core, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (!WorkspaceUri(e.Source)) return;
            try
            {
                string message = e.TryGetWebMessageAsString();
                if (!Regex.IsMatch(message, @"\Aproelite-device-v1:[a-f0-9]{64}\z")) return;
                const string name = "ProElite.Inspection.DeviceProof.v1";
                CngKey key;
                if (CngKey.Exists(name, CngProvider.MicrosoftSoftwareKeyStorageProvider))
                    key = CngKey.Open(name, CngProvider.MicrosoftSoftwareKeyStorageProvider);
                else
                {
                    var options = new CngKeyCreationParameters {
                        Provider = CngProvider.MicrosoftSoftwareKeyStorageProvider,
                        ExportPolicy = CngExportPolicies.None,
                        KeyUsage = CngKeyUsages.Signing
                    };
                    key = CngKey.Create(CngAlgorithm.ECDsaP256, name, options);
                }
                using (key)
                using (var signer = new ECDsaCng(key))
                using (var hash = SHA256.Create())
                {
                    byte[] blob = key.Export(CngKeyBlobFormat.EccPublicBlob);
                    if (blob.Length != 72) throw new CryptographicException();
                    byte[] xy = new byte[64];
                    Buffer.BlockCopy(blob, 8, xy, 0, 64);
                    byte[] sig = signer.SignHash(hash.ComputeHash(Encoding.UTF8.GetBytes(message)));
                    core.PostWebMessageAsString("proelite-device-result:" + message.Substring(19) + ":" + Convert.ToBase64String(xy) + ":" + Convert.ToBase64String(sig));
                }
            }
            catch { core.PostWebMessageAsString("proelite-device-error"); }
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
                core.WebMessageReceived += (s,e) => DeviceProof(core,e);
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
