#if os(iOS)
import UIKit

/// How a native sign-in is replayed into the embedded web app, whose Firebase JS SDK
/// keeps its own session (see frontend/src/utils/nativeBridge.js).
public enum WebHandoff: Sendable {
    case google(idToken: String, accessToken: String)
    /// Held only in memory, only until the hand-off runs, and never written anywhere.
    case email(email: String, password: String)
}

/// The web part of the app: the existing React site in a Capacitor web view. The app
/// target implements this (it owns Capacitor); the native screens only see this API.
@MainActor
public protocol WebHost: AnyObject {
    /// The one long-lived web view controller, shown in the More tab.
    var viewController: UIViewController { get }
    /// Navigate the web app to a route such as "/fee-collection/preschool/<id>".
    func open(path: String)
    /// Sign the web app in as the native user (no-op if it already is).
    func handOff(_ handoff: WebHandoff, expectedUid: String) async
    /// Sign the web app out.
    func signOut() async
}
#endif
