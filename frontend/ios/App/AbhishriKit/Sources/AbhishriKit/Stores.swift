#if os(iOS)
import Foundation
import Observation
import FirebaseFirestore
import FirebaseDatabase
import AbhishriCore

/// Every student, live. The web reads the whole collection the same way (directory,
/// attendance, dues), and Firestore's offline cache makes re-opening cheap.
@MainActor
@Observable
public final class StudentsStore {
    public private(set) var students: [Student] = []
    public private(set) var loaded = false
    public private(set) var error: String?
    private var listener: ListenerRegistration?

    public init() {}

    public func start() {
        guard listener == nil else { return }
        listener = Firestore.firestore().collection("students").addSnapshotListener { [weak self] snap, err in
            Task { @MainActor in
                guard let self else { return }
                if let err { self.error = Session.describe(err); self.loaded = true; return }
                self.students = (snap?.documents ?? [])
                    .map { Student(id: $0.documentID, data: FirestoreValues.normalize($0.data())) }
                    .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                self.error = nil
                self.loaded = true
            }
        }
    }

    public func stop() {
        listener?.remove()
        listener = nil
        students = []
        loaded = false
    }

    public func student(_ id: String) -> Student? { students.first { $0.id == id } }
}

@MainActor
@Observable
public final class StaffStore {
    public private(set) var staff: [StaffMember] = []
    public private(set) var loaded = false
    public private(set) var error: String?

    public init() {}

    public func load() async {
        do {
            let snap = try await Firestore.firestore().collection("staff").getDocuments()
            staff = snap.documents
                .map { StaffMember(id: $0.documentID, data: FirestoreValues.normalize($0.data())) }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            error = nil
        } catch {
            self.error = Session.describe(error)
        }
        loaded = true
    }
}

/// Attendance lives in the Realtime Database, one node per local day:
///   modules/student_directory/attendance/{YYYY-MM-DD}/{studentId}  (preschool + tuition)
///   modules/staff_directory/attendance/{YYYY-MM-DD}/{staffId}
/// exactly the paths Attendance.jsx and the nightly aggregate use.
public enum AttendanceModule: String {
    case students = "student_directory"
    case staff = "staff_directory"
}

@MainActor
@Observable
public final class AttendanceDay {
    public private(set) var statuses: [String: AttendanceStatus] = [:]
    public private(set) var loaded = false
    public private(set) var error: String?
    private var handle: DatabaseHandle?
    private var ref: DatabaseReference?
    /// Bumped on every observe/stop, so a reply for the previous day that arrives after
    /// switching is dropped instead of flashing that day's marks.
    private var generation = 0

    public init() {}

    /// Follow one day live, so two teachers marking the same sheet see each other.
    public func observe(_ module: AttendanceModule, day: String) {
        stop()
        let ref = Database.database().reference(withPath: "modules/\(module.rawValue)/attendance/\(day)")
        self.ref = ref
        let current = generation
        handle = ref.observe(.value, with: { [weak self] snap in
            let value = snap.value as? [String: Any] ?? [:]
            var out: [String: AttendanceStatus] = [:]
            for (id, rec) in value {
                if let s = (rec as? [String: Any])?["status"] as? String, let status = AttendanceStatus(rawValue: s) {
                    out[id] = status
                }
            }
            Task { @MainActor in
                guard let self, self.generation == current else { return }
                self.statuses = out
                self.error = nil
                self.loaded = true
            }
        }, withCancel: { [weak self] err in
            Task { @MainActor in
                guard let self, self.generation == current else { return }
                self.error = err.localizedDescription
                self.loaded = true
            }
        })
    }

    public func stop() {
        generation += 1
        if let handle, let ref { ref.removeObserver(withHandle: handle) }
        handle = nil
        ref = nil
        statuses = [:]
        loaded = false
    }

    /// Same record shape the web writes. The database rules check the caller's mirrored
    /// permissions (rtdb_permissions/{uid}), so a user without `mark` is refused there too.
    public static func mark(_ module: AttendanceModule, day: String, id: String, status: AttendanceStatus, by email: String) async throws {
        try await Database.database().reference(withPath: "modules/\(module.rawValue)/attendance/\(day)/\(id)").setValue([
            "status": status.rawValue,
            "timestamp": ServerValue.timestamp(),
            "performedBy": email,
        ])
    }

    /// The last `days` local days of records: day key -> id -> status. Read directly from
    /// the per-day nodes, as the web report now does (the nightly aggregate only ever
    /// counted the current day).
    public static func history(_ module: AttendanceModule, days: Int) async throws -> [String: [String: AttendanceStatus]] {
        let keys = DateKeys.recentKeys(days)
        return try await withThrowingTaskGroup(of: (String, [String: AttendanceStatus]).self) { group in
            for key in keys {
                group.addTask {
                    let snap = try await Database.database().reference(withPath: "modules/\(module.rawValue)/attendance/\(key)").getData()
                    var out: [String: AttendanceStatus] = [:]
                    for (id, rec) in snap.value as? [String: Any] ?? [:] {
                        if let s = (rec as? [String: Any])?["status"] as? String, let status = AttendanceStatus(rawValue: s) {
                            out[id] = status
                        }
                    }
                    return (key, out)
                }
            }
            var all: [String: [String: AttendanceStatus]] = [:]
            for try await (key, day) in group where !day.isEmpty { all[key] = day }
            return all
        }
    }
}

/// One student's ledger rows, newest first, live.
@MainActor
@Observable
public final class LedgerStore {
    public private(set) var entries: [LedgerEntry] = []
    public private(set) var loaded = false
    public private(set) var error: String?
    private var listener: ListenerRegistration?

    public init() {}

    public func start(studentId: String, limit: Int = 50) {
        listener?.remove()
        listener = Firestore.firestore()
            .collection("students").document(studentId).collection("transactions")
            .order(by: "timestamp", descending: true).limit(to: limit)
            .addSnapshotListener { [weak self] snap, err in
                Task { @MainActor in
                    guard let self else { return }
                    if let err { self.error = Session.describe(err); self.loaded = true; return }
                    self.entries = (snap?.documents ?? []).map { LedgerEntry(id: $0.documentID, data: FirestoreValues.normalize($0.data())) }
                    self.error = nil
                    self.loaded = true
                }
            }
    }

    public func stop() { listener?.remove(); listener = nil }
}

/// Recent payments across all students, for the Home tab. Same bounded query as the web
/// dashboard (latest 400), and the same rule: concessions are not money received, while
/// void reversals (negative) net their originals off.
@MainActor
@Observable
public final class RecentPaymentsStore {
    public private(set) var recent: [LedgerEntry] = []
    public private(set) var receivedThisMonth: Double = 0
    public private(set) var loaded = false
    private var listener: ListenerRegistration?

    public init() {}

    public func start() {
        guard listener == nil else { return }
        listener = Firestore.firestore().collectionGroup("transactions")
            .order(by: "timestamp", descending: true).limit(to: 400)
            .addSnapshotListener { [weak self] snap, _ in
                Task { @MainActor in
                    guard let self else { return }
                    // Keyed by full path: ids repeat across students (students/A/transactions/pay1,
                    // students/B/transactions/pay1), and SwiftUI rows need unique ids.
                    let rows = (snap?.documents ?? []).map { LedgerEntry(id: $0.reference.path, data: FirestoreValues.normalize($0.data())) }
                        .filter { $0.kind != .discount }
                    let cal = Calendar.current
                    let now = Date()
                    self.receivedThisMonth = rows
                        .filter { $0.date.map { cal.isDate($0, equalTo: now, toGranularity: .month) } ?? false }
                        .reduce(0) { $0 + $1.amount }
                    self.recent = Array(rows.filter { $0.kind == .incoming && !$0.isVoided }.prefix(5))
                    self.loaded = true
                }
            }
    }

    public func stop() { listener?.remove(); listener = nil; loaded = false }
}
#endif
