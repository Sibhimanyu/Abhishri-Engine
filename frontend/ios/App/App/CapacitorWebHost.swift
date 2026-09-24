import UIKit
import WebKit
import Capacitor
import AbhishriKit

/// The web half of the app: the existing React site in Capacitor's web view (loaded from
/// the live site, see capacitor.config.json), exposed to the native screens as a WebHost.
///
/// It talks to the page through window.AbhishriNative (frontend/src/utils/nativeBridge.js).
/// When a deploy predates that bridge, every call quietly does nothing: the web app then
/// shows its own sign-in screen, and `open` falls back to loading the URL.
@MainActor
final class CapacitorWebHost: WebHost {
    private lazy var bridgeController = AppViewController()

    var viewController: UIViewController { bridgeController }

    /// Start loading the site now, so it is ready (and signed in) before the user
    /// first opens the More tab.
    func preload() {
        _ = bridgeController.view
    }

    private var webView: WKWebView? {
        preload()
        return bridgeController.webView
    }

    func open(path: String) {
        Task {
            if await waitForBridge(timeout: 20) {
                _ = try? await call("window.AbhishriNative.navigate(path)", ["path": path])
            } else if let webView, let current = webView.url,
                      var components = URLComponents(url: current, resolvingAgainstBaseURL: false) {
                components.path = path
                components.query = nil
                if let url = components.url { webView.load(URLRequest(url: url)) }
            }
        }
    }

    func handOff(_ handoff: WebHandoff, expectedUid: String) async {
        guard await waitForBridge(timeout: 30) else { return }
        if let uid = try? await call("return window.AbhishriNative.currentUid()") as? String, uid == expectedUid {
            return
        }
        do {
            switch handoff {
            case let .google(idToken, accessToken):
                _ = try await call("return await window.AbhishriNative.signInWithGoogle(idToken, accessToken)",
                                   ["idToken": idToken, "accessToken": accessToken])
            case let .email(email, password):
                _ = try await call("return await window.AbhishriNative.signInWithEmail(email, password)",
                                   ["email": email, "password": password])
            }
        } catch {
            // Not fatal: the web app shows its own sign-in if the hand-off didn't take.
            CAPLog.print("[CapacitorWebHost] web sign-in hand-off failed: \(error.localizedDescription)")
        }
    }

    func signOut() async {
        guard await waitForBridge(timeout: 3) else { return }
        _ = try? await call("return await window.AbhishriNative.signOut()")
    }

    // MARK: Bridge

    private func call(_ body: String, _ arguments: [String: Any] = [:]) async throws -> Any? {
        guard let webView else { return nil }
        // callAsyncJavaScript passes arguments as real JS values (no string escaping) and
        // awaits a returned promise.
        return try await webView.callAsyncJavaScript(body, arguments: arguments, in: nil, contentWorld: .page)
    }

    /// Wait until the page has installed window.AbhishriNative (it loads over the network).
    private func waitForBridge(timeout: TimeInterval) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let ready = try? await call("return !!(window.AbhishriNative && window.AbhishriNative.version >= 1)") as? Bool, ready {
                return true
            }
            try? await Task.sleep(for: .milliseconds(300))
        }
        return false
    }
}
