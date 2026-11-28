import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WorkspaceController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class WorkspaceController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let site = URL(string: "https://teaminspectionproelite.github.io/INSPECTION-SERVICES/")!
    private let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    private let status = UILabel()
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        web.navigationDelegate = self
        web.uiDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        status.text = "Opening ProElite Inspection…"
        status.textAlignment = .center
        status.numberOfLines = 0
        status.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(status)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            status.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            status.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            status.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.9)
        ])
        web.load(URLRequest(url: site))
    }
    private func permitted(_ url: URL?) -> Bool {
        guard let u = url else { return false }
        return u.scheme == "https" && u.host == site.host && (u.port == nil || u.port == 443)
            && u.user == nil && u.password == nil && u.path.hasPrefix("/INSPECTION-SERVICES/")
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        guard navigationAction.targetFrame != nil, permitted(navigationAction.request.url) else {
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { status.isHidden = true }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        status.text = "เปิดโปรแกรมไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต\nCannot open ProElite. Check your connection and relaunch."
        status.isHidden = false
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
}
