import Foundation

public enum Money {
    /// '₹1,23,456' with Indian digit grouping, no paise, like the web's toLocaleString('en-IN').
    public static func inr(_ amount: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = Locale(identifier: "en_IN")
        f.currencySymbol = "₹"
        f.maximumFractionDigits = 0
        f.minimumFractionDigits = 0
        return f.string(from: NSNumber(value: amount.rounded())) ?? "₹\(Int(amount.rounded()))"
    }
}
