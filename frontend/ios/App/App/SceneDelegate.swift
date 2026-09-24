import UIKit
import SwiftUI
import Capacitor
import AbhishriKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let webHost = CapacitorWebHost()

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Native SwiftUI screens at the root; the web app lives inside them (More tab).
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = UIHostingController(rootView: RootView(web: webHost))
        window?.makeKeyAndVisible()
        webHost.preload()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Google sign-in returns through the REVERSED_CLIENT_ID URL scheme.
        let unhandled = URLContexts.filter { !AbhishriKit.handle(url: $0.url) }
        if !unhandled.isEmpty {
            SceneDelegateProxy.shared.scene(scene, openURLContexts: unhandled)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
