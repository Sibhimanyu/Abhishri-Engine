#if os(iOS)
import Foundation

/// Launch options for screenshots and manual testing against the local emulators, e.g.
///   -useEmulator -autoSignInEmail admin@abhishri.test -autoSignInPassword password123
///   -initialTab attendance -openStudent stu_aarav -openLedger stu_aarav
/// Everything is nil unless this is a Debug build talking to the emulators, so none of it
/// can affect a real install.
enum DebugLaunch {
    private static func value(_ key: String) -> String? {
        #if DEBUG
        guard AbhishriKit.usingEmulator else { return nil }
        return UserDefaults.standard.string(forKey: key)
        #else
        return nil
        #endif
    }

    static var autoSignIn: (email: String, password: String)? {
        guard let e = value("autoSignInEmail"), let p = value("autoSignInPassword") else { return nil }
        return (e, p)
    }

    static var initialTab: AppTab? {
        switch value("initialTab") {
        case "home": .home
        case "attendance": .attendance
        case "students": .students
        case "fees": .fees
        case "more": .more
        default: nil
        }
    }

    static var openStudent: String? { value("openStudent") }
    static var openLedger: String? { value("openLedger") }
    static var attendanceMode: String? { value("attendanceMode") }
}
#endif
