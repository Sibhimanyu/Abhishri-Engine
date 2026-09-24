import Foundation

/// Port of functions/src/shared/paymentRules.mjs. The server (logPayment) enforces these
/// too; the app checks first only so the form can say what's missing before sending.
public enum PaymentMethod: String, CaseIterable, Identifiable, Sendable {
    case cash = "Cash"
    case upi = "GPay/UPI"
    case bankTransfer = "Bank Transfer"
    case cheque = "Cheque"
    case card = "Card"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .cash: "Cash"
        case .upi: "GPay / UPI"
        case .bankTransfer: "Bank Transfer / NEFT"
        case .cheque: "Cheque"
        case .card: "Card"
        }
    }

    /// Bank-bound methods need a reference so the payment can be matched to a statement.
    public var requiresReference: Bool { self != .cash }

    /// '' when fine, else the same message the server returns.
    public func validateReference(_ ref: String) -> String {
        guard requiresReference, ref.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "" }
        return "A reference number is required for \(rawValue) payments so it can be matched against the bank statement."
    }
}

/// A payment's breakdown line for display: "Tuition · June".
public struct BreakdownLine: Equatable, Sendable {
    public let label: String
    public let amount: Double
}

public enum PaymentBreakdown {
    static let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    /// Keys look like '2026-tui-June', 'tui-June', '2026-adm' or 'Unallocated'
    /// (feeAllocation.mjs componentKey); names come from breakdownNames.
    /// `startMonth` is the plan's first month (0 = January; the school's year starts in
    /// June, 5), so a June–May year lists January after December.
    public static func lines(breakdown: [String: Double], names: [String: String], startMonth: Int = 5) -> [BreakdownLine] {
        breakdown.map { key, amount in
            let name = names[key] ?? key
            let month = months.first { key.hasSuffix("-\($0)") }
            return (key, BreakdownLine(label: month.map { "\(name) · \($0)" } ?? name, amount: amount))
        }
        // Unallocated last, the rest in plan order (one-time first, then by month).
        .sorted { a, b in
            if (a.0 == "Unallocated") != (b.0 == "Unallocated") { return b.0 == "Unallocated" }
            return order(a.0, startMonth) < order(b.0, startMonth)
        }
        .map(\.1)
    }

    private static func order(_ key: String, _ startMonth: Int) -> Int {
        guard let i = months.firstIndex(where: { key.hasSuffix("-\($0)") }) else { return -1 }
        return (i - startMonth + 12) % 12
    }
}
