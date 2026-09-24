import Foundation

/// Enrollment status and the per-day "was this student on the rolls" rule.
///
/// A port of functions/src/shared/enrollment.mjs (isDiscontinued, getDiscontinuationDate,
/// isEnrolledOn, isOnRolls). Keep the two in step: the web, the dues engine and these
/// screens must agree on who is on the attendance sheet and in the head count. Billing
/// (billingSchedule) is deliberately NOT ported: the native screens read the dues the
/// backend already computed (students/{id}.financialSummary) instead of recomputing them.
///
/// Input is the student document as a plain dictionary, with Firestore Timestamps already
/// converted to Date (the data layer does that).
public enum Enrollment {
    public static let active = "active"
    public static let discontinued = "discontinued"

    /// Absent or unknown enrollmentStatus means active: records from before the feature
    /// have no such field.
    public static func isDiscontinued(_ student: [String: Any]) -> Bool {
        (student["enrollmentStatus"] as? String) == discontinued
    }

    /// Mirrors parseDate in enrollment.mjs. A bare 'YYYY-MM-DD' (what the date pickers
    /// store) is LOCAL midnight; anything with a time part is an instant (ISO 8601), so
    /// 00:30 IST on the 1st reads as the 1st rather than as the UTC date, the 31st.
    public static func parseDate(_ value: Any?, calendar: Calendar = .current) -> Date? {
        switch value {
        case let d as Date:
            return d
        case let s as String:
            if let d = DateKeys.date(fromKey: s, calendar: calendar) { return d }
            return iso(s)
        default:
            return nil
        }
    }

    private static func iso(_ s: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: s) { return d }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: s)
    }

    /// The last attending day of a discontinued student; nil for an active one, even if a
    /// stale `discontinuation` record is still on the document.
    public static func exitDate(_ student: [String: Any], calendar: Calendar = .current) -> Date? {
        guard isDiscontinued(student), let d = student["discontinuation"] as? [String: Any] else { return nil }
        return parseDate(d["effectiveDate"] ?? d["date"], calendar: calendar)
    }

    struct Absence { let exit: Date; let back: Date }

    /// Completed absences: earlier discontinuations that ended in a re-enrollment.
    static func pastAbsences(_ student: [String: Any], calendar: Calendar) -> [Absence] {
        let history = student["discontinuationHistory"] as? [[String: Any]] ?? []
        return history.compactMap { h in
            guard let exit = parseDate(h["effectiveDate"] ?? h["date"], calendar: calendar),
                  let back = parseDate(h["reEnrolledOn"] ?? h["reEnrolledAt"], calendar: calendar) else { return nil }
            return Absence(exit: exit, back: back)
        }
    }

    /// Local calendar day as a sortable integer (20260923).
    static func dayNumber(_ d: Date, calendar: Calendar) -> Int {
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return (c.year ?? 0) * 10000 + (c.month ?? 0) * 100 + (c.day ?? 0)
    }

    /// Was this student on the rolls on the given day? False after the current exit date,
    /// and false inside an earlier absence (after that exit, before the return). The exit
    /// day and the return day both count as enrolled.
    public static func isEnrolled(_ student: [String: Any], on date: Date, calendar: Calendar = .current) -> Bool {
        let day = dayNumber(date, calendar: calendar)
        if isDiscontinued(student) {
            // Discontinued with no usable date: treat as gone, never as still enrolled.
            guard let exit = exitDate(student, calendar: calendar), day <= dayNumber(exit, calendar: calendar) else { return false }
        }
        return !pastAbsences(student, calendar: calendar).contains { a in
            day > dayNumber(a.exit, calendar: calendar) && day < dayNumber(a.back, calendar: calendar)
        }
    }

    /// On the rolls right now: active, or discontinued with an exit date still ahead.
    public static func isOnRolls(_ student: [String: Any], now: Date = Date(), calendar: Calendar = .current) -> Bool {
        isEnrolled(student, on: now, calendar: calendar)
    }
}
