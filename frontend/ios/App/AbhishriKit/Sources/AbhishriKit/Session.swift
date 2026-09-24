#if os(iOS)
import Foundation
import Observation
import UIKit
import FirebaseAuth
import FirebaseFirestore
import GoogleSignIn
import AbhishriCore

/// Who is signed in, and what they may see. Resolved the same way AuthContext.jsx does:
/// allowed_users/{uid}, falling back to allowed_users/{email}, then permission_groups/{role}
/// (or the role's built-in defaults). Anyone with no allowed_users record is not staff
/// (a parent or student), and gets the web portal instead of the native screens.
public struct Profile: Equatable {
    public let uid: String
    public let email: String
    public let name: String
    public let role: String
    public let permissions: Permissions
}

@MainActor
@Observable
public final class Session {
    public enum State: Equatable {
        case loading
        case signedOut
        /// Staff or admin: the native tabs.
        case staff(Profile)
        /// Signed in but not staff (parent, student, or not yet authorised): the web app,
        /// which already knows how to show the portal or the "not authorised" screen.
        case webOnly(uid: String)
        case failed(String)
    }

    public private(set) var state: State = .loading
    public var errorMessage: String?
    public private(set) var busy = false

    /// The sign-in to replay into the web view; consumed by `handOffIfPending`.
    private var pendingHandoff: WebHandoff?
    /// The uid already handed to the web view, so a later profile snapshot (a
    /// permission edit, say) doesn't replay the sign-in again.
    private var handedOffUid: String?
    private var authHandle: AuthStateDidChangeListenerHandle?
    private var profileListener: ListenerRegistration?
    private let db = Firestore.firestore()

    public weak var web: WebHost?

    public init() {
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in self?.userChanged(user) }
        }
    }

    // MARK: Sign in / out

    public func signIn(email: String, password: String) async {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Enter your email and password."
            return
        }
        busy = true
        defer { busy = false }
        do {
            pendingHandoff = .email(email: email, password: password)
            try await Auth.auth().signIn(withEmail: email, password: password)
            errorMessage = nil
        } catch {
            pendingHandoff = nil
            errorMessage = Self.describe(error)
        }
    }

    public func signInWithGoogle() async {
        guard let presenter = Self.topViewController() else { return }
        busy = true
        defer { busy = false }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else {
                errorMessage = "Google did not return a sign-in token. Please try again."
                return
            }
            let accessToken = result.user.accessToken.tokenString
            pendingHandoff = .google(idToken: idToken, accessToken: accessToken)
            let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)
            try await Auth.auth().signIn(with: credential)
            errorMessage = nil
        } catch let error as NSError where error.domain == kGIDSignInErrorDomain && error.code == GIDSignInError.canceled.rawValue {
            // Closing the Google sheet isn't an error worth showing.
        } catch {
            pendingHandoff = nil
            errorMessage = Self.describe(error)
        }
    }

    public func signOut() async {
        pendingHandoff = nil
        await web?.signOut()
        GIDSignIn.sharedInstance.signOut()
        do { try Auth.auth().signOut() } catch { errorMessage = Self.describe(error) }
    }

    // MARK: Web hand-off

    /// Replay the native sign-in into the web app. Called once the user is resolved; the
    /// web session then persists by itself, so later launches need nothing. A Google
    /// user can always be replayed (fresh tokens are restorable); an email user only
    /// right after typing the password, which is the only time the app has it.
    public func handOffIfPending(uid: String) async {
        guard let web, handedOffUid != uid else { return }
        handedOffUid = uid
        var handoff = pendingHandoff
        pendingHandoff = nil
        if handoff == nil, GIDSignIn.sharedInstance.hasPreviousSignIn(),
           let user = try? await GIDSignIn.sharedInstance.restorePreviousSignIn(),
           let refreshed = try? await user.refreshTokensIfNeeded(),
           let idToken = refreshed.idToken?.tokenString {
            handoff = .google(idToken: idToken, accessToken: refreshed.accessToken.tokenString)
        }
        guard let handoff else { return }
        await web.handOff(handoff, expectedUid: uid)
    }

    // MARK: Profile resolution

    private func userChanged(_ user: User?) {
        profileListener?.remove()
        profileListener = nil
        guard let user else {
            handedOffUid = nil
            state = .signedOut
            return
        }
        state = .loading
        // Live, so a role or permission change applies without signing out and in.
        profileListener = db.collection("allowed_users").document(user.uid).addSnapshotListener { [weak self] snap, error in
            Task { @MainActor in
                guard let self, self.isCurrent(user) else { return }
                if let error {
                    self.state = .failed(Self.describe(error))
                    return
                }
                if let data = snap?.data() {
                    await self.resolve(user: user, record: data)
                } else if let email = user.email?.lowercased(),
                          let byEmail = try? await self.db.collection("allowed_users").document(email).getDocument(),
                          let data = byEmail.data() {
                    await self.resolve(user: user, record: data)
                } else if self.isCurrent(user) {
                    self.state = .webOnly(uid: user.uid)
                }
                guard self.isCurrent(user) else { return }
                await self.handOffIfPending(uid: user.uid)
            }
        }
    }

    private func resolve(user: User, record: [String: Any]) async {
        let role = (record["role"] as? String) ?? "staff"
        let isAdmin = (record["isAdmin"] as? Bool) == true || role == "admin"
        if role == "student" || role == "parent" {
            if isCurrent(user) { state = .webOnly(uid: user.uid) }
            return
        }
        var raw: [String: Any] = [:]
        if !isAdmin {
            let group = try? await db.collection("permission_groups").document(role).getDocument()
            raw = (group?.data()?["permissions"] as? [String: Any]) ?? Permissions.defaults(forRole: role)
        }
        // A sign-out (or a switch of account) may have landed during the awaits above.
        guard isCurrent(user) else { return }
        let name = (record["name"] as? String) ?? user.displayName ?? user.email ?? "there"
        state = .staff(Profile(
            uid: user.uid,
            email: user.email ?? "",
            name: name,
            role: isAdmin ? "admin" : role,
            permissions: Permissions(isAdmin: isAdmin, raw: raw)
        ))
    }

    // MARK: Helpers

    /// Still the signed-in user? Profile lookups are async, and a late answer for an
    /// account that has since signed out must not put it back on screen.
    private func isCurrent(_ user: User) -> Bool {
        Auth.auth().currentUser?.uid == user.uid
    }

    static func describe(_ error: Error) -> String {
        let ns = error as NSError
        if ns.domain == AuthErrorDomain, let code = AuthErrorCode(rawValue: ns.code) {
            switch code {
            case .wrongPassword, .invalidCredential, .userNotFound, .invalidEmail:
                return "That email and password don't match an account."
            case .networkError:
                return "Can't reach the server. Check your connection and try again."
            case .tooManyRequests:
                return "Too many attempts. Wait a minute and try again."
            case .userDisabled:
                return "This account has been disabled. Contact the school office."
            default: break
            }
        }
        return ns.localizedDescription
    }

    static func topViewController() -> UIViewController? {
        let root = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first?.rootViewController
        var top = root
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
#endif
