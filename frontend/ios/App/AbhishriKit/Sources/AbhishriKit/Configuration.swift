#if os(iOS)
import Foundation
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import FirebaseDatabase
import GoogleSignIn

public enum AbhishriKit {
    /// Call once from application(_:didFinishLaunchingWithOptions:), before Capacitor
    /// loads: the Capacitor Firebase plugin configures Firebase only if nobody has yet,
    /// so doing it here means both sides share this one FirebaseApp.
    ///
    /// Debug builds launched with `-useEmulator` talk to the local Firebase emulators
    /// (auth 9099, firestore 8080, database 9000) instead of production, for screenshots
    /// and manual testing against seeded data. See docs/ios-app.md.
    public static func configure() {
        if FirebaseApp.app() == nil { FirebaseApp.configure() }

        if let clientID = FirebaseApp.app()?.options.clientID {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-useEmulator") {
            // Ports can be overridden with launch arguments (`-firestorePort 8181`), which
            // land in UserDefaults, for machines where the defaults are taken.
            let defaults = UserDefaults.standard
            func port(_ key: String, _ fallback: Int) -> Int {
                let v = defaults.integer(forKey: key)
                return v > 0 ? v : fallback
            }
            let host = "127.0.0.1"
            Auth.auth().useEmulator(withHost: host, port: port("authPort", 9099))
            let settings = Firestore.firestore().settings
            settings.host = "\(host):\(port("firestorePort", 8080))"
            settings.isSSLEnabled = false
            settings.cacheSettings = MemoryCacheSettings()
            Firestore.firestore().settings = settings
            Database.database().useEmulator(withHost: host, port: port("databasePort", 9000))
            usingEmulator = true
        }
        #endif
    }

    public private(set) static var usingEmulator = false

    /// Forward Google sign-in's redirect back into the app. Returns true if handled.
    @discardableResult
    public static func handle(url: URL) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
    }
}
#endif
