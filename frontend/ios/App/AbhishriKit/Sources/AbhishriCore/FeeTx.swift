import Foundation

/// Port of classifyIncomeTx in functions/src/shared/feeTx.mjs, the single rule for what a
/// ledger row is. Keep in step with it (see that file for why it is shaped this way).
public enum FeeTxKind: String { case incoming, discount, void }

public enum FeeTx {
    static let concessionCategories: Set<String> = ["Discount", "Fee Concession"]

    public static func classify(_ t: [String: Any]) -> FeeTxKind {
        let type = t["type"] as? String
        let category = t["category"] as? String
        let method = t["method"] as? String
        let concessionShaped = category.map(concessionCategories.contains) ?? false
        let isConcession = type == "discount"
            || (type == "void" && concessionShaped)
            || ((type == nil || type == "") && (concessionShaped || method == "Concession"))
        if isConcession { return .discount }
        return type == "void" ? .void : .incoming
    }
}
