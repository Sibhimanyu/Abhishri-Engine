#if os(iOS)
import Foundation
import AbhishriCore

public enum Wing: String, CaseIterable, Identifiable {
    case preschool, tuition
    public var id: String { rawValue }
    public var label: String { self == .preschool ? "Preschool" : "Tuition" }
}

/// The backend's dues snapshot on students/{id}.financialSummary, written by
/// reconcileStudent (functions/src/fees/triggers.js). The native screens show these
/// figures rather than recomputing them, so they always match the web and the reports.
public struct FeeSummary {
    public let status: String          // clear | arrears | ahead | unconfigured
    public let dueNow: Double
    public let aheadBy: Double
    public let totalPaid: Double
    public let totalDiscounted: Double
    public let annualRemaining: Double
    public let annualNetFee: Double
    public let installmentsBilled: Int?

    init?(_ d: [String: Any]) {
        guard !d.isEmpty else { return nil }
        status = d.string("status") ?? "clear"
        dueNow = d.double("dueNow")
        aheadBy = d.double("aheadBy")
        totalPaid = d.double("totalPaid")
        totalDiscounted = d.double("totalDiscounted")
        annualRemaining = d.double("annualRemaining")
        annualNetFee = d.double("annualNetFee")
        installmentsBilled = (d["installmentsBilled"] as? NSNumber)?.intValue
    }
}

public struct Student: Identifiable {
    public let id: String
    /// The whole document, Timestamps already converted to Date.
    public let raw: [String: Any]

    public let name: String
    public let wing: Wing
    /// Optional on purpose: Montessori classes are mixed-age, so an empty class is normal
    /// and never shown as missing data.
    public let className: String?
    public let summary: FeeSummary?

    init(id: String, data: [String: Any]) {
        self.id = id
        raw = data
        let first = data.string("firstName") ?? ""
        let last = data.string("lastName") ?? ""
        let joined = "\(first) \(last)".trimmingCharacters(in: .whitespaces)
        name = data.string("name") ?? (joined.isEmpty ? "Unknown" : joined)
        wing = Wing(rawValue: data.string("programType") ?? data.string("studentType") ?? "preschool") ?? .preschool
        className = data.string("admissionForClass") ?? data.string("className") ?? data.string("grade")
        summary = FeeSummary(data.dict("financialSummary"))
    }

    public var isDiscontinued: Bool { Enrollment.isDiscontinued(raw) }
    public var exitDate: Date? { Enrollment.exitDate(raw) }
    public func isEnrolled(on date: Date) -> Bool { Enrollment.isEnrolled(raw, on: date) }
    public var isOnRolls: Bool { Enrollment.isOnRolls(raw) }
    /// Discontinued but still serving out notice (exit date ahead).
    public var isLeaving: Bool { isDiscontinued && isOnRolls }

    public func field(_ key: String) -> String? { raw.string(key) }
    public var discontinuation: [String: Any] { raw.dict("discontinuation") }

    public var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }
}

public struct StaffMember: Identifiable {
    public let id: String
    public let raw: [String: Any]
    public let name: String
    public let designation: String?
    public let email: String?
    public let phone: String?
    /// Maintained by the server (syncStaffWalletBalance / dailyWalletReconciliation).
    public let walletBalance: Double?

    init(id: String, data: [String: Any]) {
        self.id = id
        raw = data
        name = data.string("name") ?? data.string("email") ?? "Unknown"
        designation = data.string("designation") ?? data.string("role")
        email = data.string("email")?.lowercased()
        phone = data.string("phone")
        walletBalance = (data["walletBalance"] as? NSNumber)?.doubleValue
    }

    public func field(_ key: String) -> String? { raw.string(key) }

    public var initials: String {
        name.split(separator: " ").prefix(2).compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    /// The wings they work in, as the staff profile records them.
    public var wings: [String] {
        [raw.bool("worksInPreschool") ? "Preschool" : nil, raw.bool("worksInTuition") ? "Tuition" : nil].compactMap { $0 }
    }
}

public struct Expense: Identifiable {
    public let id: String
    public let amount: Double
    /// 'spend' (school paid), 'expense' (from a staff wallet) or 'funding' (wallet top-up).
    public let type: String
    public let source: String
    public let category: String
    public let details: String?
    public let date: Date?
    public let attachmentUrl: URL?
    public let createdBy: String?
    public let staffEmail: String?

    init(id: String, data: [String: Any]) {
        self.id = id
        amount = data.double("amount")
        type = data.string("type") ?? "spend"
        source = data.string("source") ?? "office"
        category = data.string("category") ?? "Miscellaneous"
        details = data.string("details")
        date = data.date("timestamp")
        attachmentUrl = data.string("attachmentUrl").flatMap(URL.init(string:))
        createdBy = data.string("createdBy")?.lowercased()
        staffEmail = data.string("staffEmail")?.lowercased()
    }

    public var isFunding: Bool { type == "funding" }
    public var isWallet: Bool { source == ExpenseSource.staffWallet.rawValue }
    public var title: String { details ?? (ExpenseCategory(rawValue: category)?.label ?? category) }
    public var categorySymbol: String { ExpenseCategory(rawValue: category)?.symbol ?? "tag" }
}

public enum AttendanceStatus: String, CaseIterable, Identifiable {
    case present, absent, late
    public var id: String { rawValue }
    public var label: String { rawValue.capitalized }
}

public struct LedgerEntry: Identifiable {
    public let id: String
    public let amount: Double
    public let kind: FeeTxKind
    public let method: String
    public let description: String
    public let date: Date?
    public let isVoided: Bool
    public let externalRef: String?
    public let addedBy: String?
    public let studentName: String?

    init(id: String, data: [String: Any]) {
        self.id = id
        amount = data.double("amount")
        kind = FeeTx.classify(data)
        method = data.string("method") ?? "Cash"
        description = data.string("description") ?? (kind == .discount ? "Concession" : "Fee Payment")
        date = data.date("receivedAt") ?? data.date("timestamp")
        isVoided = data.bool("isVoided")
        externalRef = data.string("externalRef")
        addedBy = data.string("addedBy")
        studentName = data.string("studentName")
    }
}
#endif
