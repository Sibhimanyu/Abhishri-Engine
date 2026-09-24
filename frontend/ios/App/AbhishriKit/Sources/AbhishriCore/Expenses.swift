import Foundation

/// Categories and sources for staff expenses, as FeesMyExpenses.jsx writes them. The
/// stored values (rawValue) are what reports group by, so they must not change.
public enum ExpenseCategory: String, CaseIterable, Identifiable, Sendable {
    case officeSupplies = "Office Supplies"
    case maintenance = "Maintenance"
    case utilityBills = "Utility Bills"
    case transport = "Transport"
    case meals = "Meals/Entertainment"
    case refreshments = "Refreshments"
    case miscellaneous = "Miscellaneous"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .maintenance: "Maintenance & Repairs"
        case .transport: "Transport & Travel"
        default: rawValue
        }
    }

    public var symbol: String {
        switch self {
        case .officeSupplies: "paperclip"
        case .maintenance: "wrench.and.screwdriver"
        case .utilityBills: "bolt"
        case .transport: "car"
        case .meals: "fork.knife"
        case .refreshments: "cup.and.saucer"
        case .miscellaneous: "tag"
        }
    }
}

/// Who paid: the school directly ('office', stored as type 'spend'), or the staff member
/// out of their own float ('staff_wallet', stored as type 'expense', which draws their
/// wallet down).
public enum ExpenseSource: String, CaseIterable, Identifiable, Sendable {
    case office
    case staffWallet = "staff_wallet"

    public var id: String { rawValue }
    public var storedType: String { self == .office ? "spend" : "expense" }
    public var label: String { self == .office ? "School paid" : "From my wallet" }
}

public enum Wallet {
    /// A staff member's balance from their staff_wallet entries: fundings add, everything
    /// else subtracts. Same rule as the server's reconcileWallet (functions/src/fees/
    /// triggers.js), used only until the server's staff/{id}.walletBalance is available.
    public static func balance(_ entries: [(type: String, source: String, amount: Double)]) -> Double {
        entries.filter { $0.source == ExpenseSource.staffWallet.rawValue }
            .reduce(0) { $0 + ($1.type == "funding" ? $1.amount : -$1.amount) }
    }
}
