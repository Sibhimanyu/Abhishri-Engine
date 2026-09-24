#if os(iOS)
import Foundation
import FirebaseFirestore

/// Firestore documents arrive as [String: Any] holding Timestamps. The shared rules in
/// AbhishriCore know nothing about Firebase, so dates are converted once, here.
enum FirestoreValues {
    static func normalize(_ value: Any) -> Any {
        switch value {
        case let ts as Timestamp: return ts.dateValue()
        case let dict as [String: Any]: return dict.mapValues(normalize)
        case let array as [Any]: return array.map(normalize)
        default: return value
        }
    }

    static func normalize(_ dict: [String: Any]) -> [String: Any] {
        dict.mapValues(normalize)
    }
}

/// Lenient field access: the same field is a String in one document and a Number in
/// another (phone numbers, amounts), so reads never assume one type.
extension Dictionary where Key == String, Value == Any {
    func string(_ key: String) -> String? {
        switch self[key] {
        case let s as String: return s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : s
        case let n as NSNumber: return n.stringValue
        default: return nil
        }
    }

    func double(_ key: String) -> Double {
        switch self[key] {
        case let n as NSNumber: return n.doubleValue
        case let s as String: return Double(s) ?? 0
        default: return 0
        }
    }

    func bool(_ key: String) -> Bool {
        (self[key] as? Bool) ?? ((self[key] as? NSNumber)?.boolValue ?? false)
    }

    func date(_ key: String) -> Date? {
        self[key] as? Date
    }

    func dict(_ key: String) -> [String: Any] {
        self[key] as? [String: Any] ?? [:]
    }
}
#endif
