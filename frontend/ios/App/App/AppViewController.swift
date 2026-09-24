import UIKit
import Capacitor
import AbhishriKit

/// The app's root view controller: Capacitor's bridge plus the plugins that live
/// in this app rather than in npm packages.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PrintPlugin())
        // Replaces the stock @capacitor-firebase/authentication plugin for the two calls
        // the web app makes, so the web can never sign the native screens out by accident.
        // See WebAuthShim in AbhishriKit.
        bridge?.registerPluginInstance(WebFirebaseAuthenticationPlugin())
    }
}

/// Same jsName as the stock plugin, so web code calling FirebaseAuthentication.* lands
/// here. Only the methods the web app uses (Login.jsx, firebase.js) are provided.
@objc(WebFirebaseAuthenticationPlugin)
public class WebFirebaseAuthenticationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebFirebaseAuthenticationPlugin"
    public let jsName = "FirebaseAuthentication"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signInWithGoogle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
    ]

    @objc func signInWithGoogle(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present Google sign-in")
                return
            }
            do {
                let tokens = try await WebAuthShim.signInWithGoogle(presenting: presenter)
                // Same shape as the stock plugin's result, which Login.jsx reads.
                call.resolve(["credential": [
                    "providerId": "google.com",
                    "idToken": tokens.idToken,
                    "accessToken": tokens.accessToken,
                ]])
            } catch {
                call.reject(WebAuthShim.isCancellation(error) ? "The user canceled the sign-in flow." : error.localizedDescription)
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        do {
            try WebAuthShim.signOut(endNativeSession: call.getBool("endNativeSession", false))
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }
}

/// WKWebView ignores window.print(), so receipts and reports print through
/// UIKit instead. The web view's print formatter renders with the page's
/// @media print styles, matching what the browser prints.
@objc(PrintPlugin)
public class PrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PrintPlugin"
    public let jsName = "Print"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)
    ]

    @objc func print(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("Web view unavailable")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = call.getString("name") ?? "Abhishri Academy"

            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            controller.present(animated: true) { _, completed, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
        }
    }
}
