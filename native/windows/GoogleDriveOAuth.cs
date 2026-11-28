using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class GoogleDriveOAuth
{
    private const string Scope = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file";
    private const string AuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
    private const string TokenEndpoint = "https://oauth2.googleapis.com/token";
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536 };
    internal sealed class OAuthFailure : Exception { internal OAuthFailure(string code) : base(code) {} }
    private static string RandomToken()
    {
        byte[] b = new byte[32]; using(var rng=RandomNumberGenerator.Create()) rng.GetBytes(b);
        return Base64Url(b);
    }
    private static string Base64Url(byte[] b) { return Convert.ToBase64String(b).TrimEnd('=').Replace('+','-').Replace('/','_'); }
    private static string TextValue(Dictionary<string,object> d,string k)
    {
        object v; return d.TryGetValue(k,out v) ? v as string : null;
    }
    private static Dictionary<string,object> LoadCredential(IWin32Window parent)
    {
        string dir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ProElite Inspection Data");
        Directory.CreateDirectory(dir);
        string file=Path.Combine(dir,"google-desktop-oauth.dpapi");
        Dictionary<string,object> config=null;
        if(File.Exists(file))
        {
            try { config=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(file),null,DataProtectionScope.CurrentUser))); }
            catch { throw new OAuthFailure("CONFIG_INVALID"); }
        }
        else
        {
            using(var dialog=new OpenFileDialog { Title="Select Google Desktop OAuth client JSON (first-time setup)",Filter="Google OAuth JSON (*.json)|*.json",CheckFileExists=true,Multiselect=false })
            {
                if(dialog.ShowDialog(parent)!=DialogResult.OK)throw new OAuthFailure("CONFIG_REQUIRED");
                try {
                    if(new FileInfo(dialog.FileName).Length>65536)throw new OAuthFailure("CONFIG_INVALID");
                    var root=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(dialog.FileName));
                    object obj; if(!root.TryGetValue("installed",out obj))throw new OAuthFailure("CONFIG_INVALID");
                    config=obj as Dictionary<string,object>;
                    Validate(config);
                    var minimal=new Dictionary<string,object>{{"client_id",TextValue(config,"client_id")},{"client_secret",TextValue(config,"client_secret")??""}};
                    File.WriteAllBytes(file,ProtectedData.Protect(Encoding.UTF8.GetBytes(Json.Serialize(minimal)),null,DataProtectionScope.CurrentUser));
                    config=minimal;
                }catch(OAuthFailure){throw;}catch{throw new OAuthFailure("CONFIG_INVALID");}
            }
        }
        Validate(config);return config;
    }
    private static void Validate(Dictionary<string,object> c)
    {
        string id=c==null?null:TextValue(c,"client_id"), secret=c==null?null:TextValue(c,"client_secret");
        if(id==null||!Regex.IsMatch(id,@"\A[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com\z")||id.Length>256||(secret!=null&&secret.Length>256))throw new OAuthFailure("CONFIG_INVALID");
    }
    private static string Query(Dictionary<string,string> d)
    {
        var parts=new List<string>();foreach(var p in d)parts.Add(Uri.EscapeDataString(p.Key)+"="+Uri.EscapeDataString(p.Value));return String.Join("&",parts.ToArray());
    }
    internal static async Task<string> AuthorizeAsync(IWin32Window parent,CancellationToken ct)
    {
        var credential=LoadCredential(parent);ct.ThrowIfCancellationRequested();
        string id=TextValue(credential,"client_id"), secret=TextValue(credential,"client_secret");
        string state=RandomToken(),verifier=RandomToken(),challenge;
        using(var sha=SHA256.Create())challenge=Base64Url(sha.ComputeHash(Encoding.ASCII.GetBytes(verifier)));
        var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();
        string redirect="http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port+"/";
        string code=null;
        try
        {
            using(ct.Register(()=>listener.Stop()))
            {
                string url=AuthorizationEndpoint+"?"+Query(new Dictionary<string,string>{{"client_id",id},{"redirect_uri",redirect},{"response_type","code"},{"scope",Scope},{"state",state},{"code_challenge",challenge},{"code_challenge_method","S256"},{"prompt","select_account"}});
                // Only the fixed Google authorization endpoint may be opened in the system browser.
                Process.Start(new ProcessStartInfo(url){UseShellExecute=true});
                while(code==null)
                {
                    ct.ThrowIfCancellationRequested();
                    TcpClient client;
                    try{client=await listener.AcceptTcpClientAsync();}catch{ct.ThrowIfCancellationRequested();throw;}
                    using(client)
                    using(var timeout=CancellationTokenSource.CreateLinkedTokenSource(ct))
                    {
                        timeout.CancelAfter(TimeSpan.FromSeconds(5));
                        using(timeout.Token.Register(()=>client.Close()))
                        {
                            try{
                                var stream=client.GetStream();string request=await ReadHeader(stream,timeout.Token);
                                string first=request.Split(new[]{"\r\n"},StringSplitOptions.None)[0];
                                var parts=first.Split(' ');
                                if(parts.Length!=3||parts[0]!="GET"||!parts[1].StartsWith("/?",StringComparison.Ordinal)){await Respond(stream,false);continue;}
                                var q=HttpUtility.ParseQueryString(parts[1].Substring(2));
                                if(q["state"]!=state){await Respond(stream,false);continue;}
                                if(!String.IsNullOrEmpty(q["error"])){await Respond(stream,false);throw new OAuthFailure("CANCELLED");}
                                string value=q["code"];
                                if(String.IsNullOrEmpty(value)||value.Length>4096){await Respond(stream,false);continue;}
                                code=value;await Respond(stream,true);
                            }catch(OAuthFailure){throw;}catch{ct.ThrowIfCancellationRequested();}
                        }
                    }
                }
            }
        }finally{listener.Stop();}
        ct.ThrowIfCancellationRequested();
        var fields=new Dictionary<string,string>{{"client_id",id},{"code",code},{"code_verifier",verifier},{"grant_type","authorization_code"},{"redirect_uri",redirect}};
        if(!String.IsNullOrEmpty(secret))fields.Add("client_secret",secret);
        using(var handler=new HttpClientHandler { AllowAutoRedirect=false })
        using(var client=new HttpClient(handler))
        using(var body=new FormUrlEncodedContent(fields))
        {
            client.Timeout=TimeSpan.FromSeconds(25);
            using(var response=await client.PostAsync(TokenEndpoint,body,ct))
            {
                if(!response.IsSuccessStatusCode)throw new OAuthFailure("TOKEN_EXCHANGE");
                var token=Json.Deserialize<Dictionary<string,object>>(await response.Content.ReadAsStringAsync());
                string access=TextValue(token,"access_token"),scope=TextValue(token,"scope");
                object expiry;
                if(String.IsNullOrEmpty(access)||access.Length>8192||String.IsNullOrEmpty(scope)||!token.TryGetValue("expires_in",out expiry))throw new OAuthFailure("TOKEN_EXCHANGE");
                return Json.Serialize(new Dictionary<string,object>{{"access_token",access},{"scope",scope},{"expires_in",expiry}});
            }
        }
    }
    private static async Task<string> ReadHeader(NetworkStream s,CancellationToken ct)
    {
        byte[] b=new byte[1024];using(var data=new MemoryStream())
        {
            while(data.Length<16384)
            {
                int n=await s.ReadAsync(b,0,b.Length,ct);if(n==0)throw new IOException();
                data.Write(b,0,n);string text=Encoding.ASCII.GetString(data.ToArray());
                if(text.Contains("\r\n\r\n"))return text;
            }
            throw new IOException();
        }
    }
    private static async Task Respond(NetworkStream s,bool ok)
    {
        string body=ok?"Google authorization response received. Return to ProElite Inspection.":"Authorization not completed. Return to ProElite Inspection.";
        byte[] bytes=Encoding.UTF8.GetBytes(body);
        byte[] header=Encoding.ASCII.GetBytes("HTTP/1.1 "+(ok?"200 OK":"400 Bad Request")+"\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\nContent-Length: "+bytes.Length+"\r\n");
        await s.WriteAsync(header,0,header.Length);await s.WriteAsync(bytes,0,bytes.Length);
    }
}
