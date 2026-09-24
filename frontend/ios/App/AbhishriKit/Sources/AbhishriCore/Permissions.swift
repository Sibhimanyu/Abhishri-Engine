import Foundation

/// What the signed-in user may do, resolved the same way AuthContext.jsx does:
/// admins get everything; everyone else gets permission_groups/{role}.permissions,
/// or the built-in defaults for their role when that group document is missing.
///
/// The server still enforces all of this (firestore.rules / database.rules.json); these
/// checks only decide what the app shows.
public struct Permissions: Sendable, Equatable {
    public let isAdmin: Bool
    /// module -> action -> allowed. A module whose value was `true` is stored as ["*": true].
    let grants: [String: [String: Bool]]

    public init(isAdmin: Bool, raw: [String: Any]) {
        self.isAdmin = isAdmin
        var g: [String: [String: Bool]] = [:]
        for (module, value) in raw {
            if let all = value as? Bool {
                g[module] = ["*": all]
            } else if let actions = value as? [String: Any] {
                g[module] = actions.compactMapValues { $0 as? Bool }
            }
        }
        grants = g
    }

    public static let none = Permissions(isAdmin: false, raw: [:])

    public func can(_ module: String, _ action: String) -> Bool {
        if isAdmin { return true }
        guard let m = grants[module] else { return false }
        return m["*"] == true || m[action] == true
    }

    public func canAny(_ module: String, _ actions: [String]) -> Bool {
        actions.contains { can(module, $0) }
    }

    /// Defaults for a role with no permission_groups document (AuthContext.jsx).
    public static func defaults(forRole role: String) -> [String: Any] {
        let isTeach = role == "teacher"
        let isPro = role == "pro"
        return [
            "staff_directory": ["view": true, "manage": isPro, "delete": false],
            "student_directory": ["view": true, "manage": isPro, "delete": false],
            "attendance": ["view": true, "mark": isTeach || isPro, "edit": isPro],
            "fees_accounting": [
                "view": false, "view_dashboard": false, "config": false,
                "ledger": false, "trans_add": false, "trans_delete": false,
                "exp_own": true, "exp_all": false, "wallet_view_own": true, "wallet_edit_own": false,
            ],
            "whatsapp_sender": ["access": false, "broadcast": false, "manage": false],
            "smart_campus": ["view": isPro, "control": isPro, "scenes": false, "config": false],
        ]
    }

    // What the native tabs need, named after the web screens they replace.
    public var canViewStudents: Bool { can("student_directory", "view") }
    public var canManageStudents: Bool { can("student_directory", "manage") }
    public var canViewStaff: Bool { can("staff_directory", "view") }
    public var canViewAttendance: Bool { canAny("attendance", ["view", "mark", "edit"]) }
    public var canMarkAttendance: Bool { can("attendance", "mark") }
    public var canViewFees: Bool { canAny("fees_accounting", ["ledger", "view"]) }
    public var canLogPayment: Bool { can("fees_accounting", "trans_add") }
    public var canViewRevenue: Bool { can("fees_accounting", "view_dashboard") }
}
