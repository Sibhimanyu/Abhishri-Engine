#if os(iOS)
import UIKit
import FirebaseAuth
import GoogleSignIn

/// What the embedded web app's two FirebaseAuthentication plugin calls do inside the
/// native app (the app target registers a Capacitor plugin that forwards here, replacing
/// the stock plugin; see AppViewController.swift).
///
/// Why replace it: the stock plugin's signOut also signs out the NATIVE Firebase session,
/// and web deploys before nativeBridge.js call signOut on every cold start (the first
/// auth callback is always "signed out"). That would sign the native screens out the
/// moment the web view loaded. Here, signOut only drops the Google session unless the
/// caller explicitly asks to end the native session, which only the new web code does,
/// and only on a real sign-out.
public enum WebAuthShim {
    /// Native Google sheet; returns the tokens for the web app's signInWithCredential.
    /// Does not sign the native Firebase session in (the stock plugin runs with
    /// skipNativeAuth, and the native app has its own sign-in screen).
    @MainActor
    public static func signInWithGoogle(presenting presenter: UIViewController) async throws -> (idToken: String, accessToken: String) {
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let idToken = result.user.idToken?.tokenString else {
            throw NSError(domain: "WebAuthShim", code: 1, userInfo: [NSLocalizedDescriptionKey: "Google did not return a sign-in token."])
        }
        return (idToken, result.user.accessToken.tokenString)
    }

    public static func isCancellation(_ error: Error) -> Bool {
        let ns = error as NSError
        return ns.domain == kGIDSignInErrorDomain && ns.code == GIDSignInError.canceled.rawValue
    }

    public static func signOut(endNativeSession: Bool) throws {
        GIDSignIn.sharedInstance.signOut()
        if endNativeSession { try Auth.auth().signOut() }
    }
}
#endif
