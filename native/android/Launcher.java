package com.teaminspectionproelite.inspection;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public final class Launcher extends Activity {
    private static final String SITE = "https://teaminspectionproelite.github.io/INSPECTION-SERVICES/";
    private static final int FILE_PICK = 100;
    private WebView web;
    private ValueCallback<Uri[]> pendingFiles;
    private boolean workspace(Uri u) {
        return "https".equals(u.getScheme()) && "teaminspectionproelite.github.io".equals(u.getHost())
            && (u.getPort() == -1 || u.getPort() == 443) && u.getUserInfo() == null
            && u.getPath() != null && u.getPath().startsWith("/INSPECTION-SERVICES/");
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return r.isForMainFrame() && !workspace(r.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return !workspace(Uri.parse(url));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                try { startActivityForResult(params.createIntent(), FILE_PICK); return true; }
                catch (Exception e) { pendingFiles.onReceiveValue(null); pendingFiles = null; return false; }
            }
        });
        // Never launch the workspace through Chrome or a Custom Tab.
        web.setDownloadListener((url,ua,disposition,mime,length) ->
            Toast.makeText(this,"File export is not yet available in this test build / รุ่นทดสอบยังไม่รองรับส่งออกไฟล์",Toast.LENGTH_LONG).show());
        setContentView(web);
        web.loadUrl(SITE);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == FILE_PICK && pendingFiles != null) {
            pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));
            pendingFiles = null;
        }
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (pendingFiles != null) { pendingFiles.onReceiveValue(null); pendingFiles = null; }
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
