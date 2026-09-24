import Foundation

/// Calendar-day helpers. Everything here is LOCAL time on purpose: attendance is keyed
/// by the school's local day ('YYYY-MM-DD'), and between 00:00 and 05:29 IST the UTC
/// date is still yesterday (the bug the web fixed with `localKey`).
public enum DateKeys {
    /// 'YYYY-MM-DD' for the local calendar day, matching the web's `localKey`.
    public static func key(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Local midnight of a bare 'YYYY-MM-DD', or nil if it isn't exactly that shape.
    public static func date(fromKey key: String, calendar: Calendar = .current) -> Date? {
        let parts = key.split(separator: "-")
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]) else { return nil }
        return calendar.date(from: DateComponents(year: y, month: m, day: d))
    }

    /// The last `count` local days ending today, newest first.
    public static func recentKeys(_ count: Int, endingAt now: Date = Date(), calendar: Calendar = .current) -> [String] {
        (0..<count).compactMap { calendar.date(byAdding: .day, value: -$0, to: now) }.map { key($0, calendar: calendar) }
    }
}
