#if os(iOS)
import Foundation
import Observation
import UIKit
import FirebaseFirestore
import FirebaseStorage
import AbhishriCore

/// An audit_logs entry, same shape as frontend/src/utils/auditLog.js. Best-effort: a
/// failure here never undoes the action it describes. firestore.rules requires
/// performedBy to be the caller's own email.
enum AuditLog {
    static func write(action: String, module: String, targetId: String, targetName: String?, email: String, details: [String: Any]) {
        Firestore.firestore().collection("audit_logs").addDocument(data: [
            "action": action,
            "module": module,
            "targetId": targetId,
            "targetName": targetName ?? NSNull(),
            "performedBy": email.lowercased(),
            "timestamp": FieldValue.serverTimestamp(),
            "details": details,
        ]) { error in
            if let error { print("[AuditLog] \(action) not recorded: \(error.localizedDescription)") }
        }
    }
}

/// The signed-in staff member's own expenses and wallet, live. Mirrors FeesMyExpenses.jsx:
/// everything they logged (createdBy) plus everything against their wallet (staffEmail),
/// and their staff record, whose walletBalance the server keeps up to date.
@MainActor
@Observable
final class MyExpensesStore {
    private(set) var expenses: [Expense] = []
    private(set) var staff: StaffMember?
    private(set) var loaded = false
    private(set) var error: String?

    private var byCreator: [String: Expense] = [:]
    private var byWallet: [String: Expense] = [:]
    private var listeners: [ListenerRegistration] = []
    private var pending = 3

    func start(email: String) {
        guard listeners.isEmpty else { return }
        let db = Firestore.firestore()
        let email = email.lowercased()
        // Emails are stored as typed, so query both the lowercased form and nothing else:
        // the web writes currentUser.email, which Firebase Auth already lowercases.
        listeners.append(db.collection("expenses").whereField("createdBy", isEqualTo: email).addSnapshotListener { [weak self] snap, err in
            Task { @MainActor in self?.apply(snap, err, into: \.byCreator) }
        })
        listeners.append(db.collection("expenses").whereField("staffEmail", isEqualTo: email).addSnapshotListener { [weak self] snap, err in
            Task { @MainActor in self?.apply(snap, err, into: \.byWallet) }
        })
        listeners.append(db.collection("staff").whereField("email", isEqualTo: email).limit(to: 1).addSnapshotListener { [weak self] snap, _ in
            Task { @MainActor in
                guard let self else { return }
                self.staff = snap?.documents.first.map { StaffMember(id: $0.documentID, data: FirestoreValues.normalize($0.data())) }
                self.arrived()
            }
        })
    }

    func stop() {
        listeners.forEach { $0.remove() }
        listeners = []
    }

    private func apply(_ snap: QuerySnapshot?, _ err: Error?, into keyPath: ReferenceWritableKeyPath<MyExpensesStore, [String: Expense]>) {
        if let err { error = Session.describe(err) }
        var map: [String: Expense] = [:]
        for d in snap?.documents ?? [] {
            let e = Expense(id: d.documentID, data: FirestoreValues.normalize(d.data()))
            if ["spend", "expense", "funding"].contains(e.type) { map[d.documentID] = e }
        }
        self[keyPath: keyPath] = map
        expenses = byCreator.merging(byWallet) { a, _ in a }.values
            .sorted { ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }
        arrived()
    }

    private func arrived() {
        if pending > 0 { pending -= 1 }
        if pending == 0 { loaded = true }
    }

    /// The server's figure when it has one; otherwise the same sum computed here.
    var walletBalance: Double {
        if let server = staff?.walletBalance { return server }
        // Only entries against this person's own wallet, like FeesMyExpenses.jsx.
        guard let mine = staff?.email else { return 0 }
        return Wallet.balance(expenses.filter { $0.staffEmail == mine }
            .map { (type: $0.type, source: $0.source, amount: $0.amount) })
    }

    var spentThisMonth: Double {
        let now = Date()
        return expenses.filter { !$0.isFunding && ($0.date.map { Calendar.current.isDate($0, equalTo: now, toGranularity: .month) } ?? false) }
            .reduce(0) { $0 + $1.amount }
    }
}

enum ExpenseService {
    struct Draft {
        var source: ExpenseSource = .office
        var amount: Double
        var category: ExpenseCategory
        var details: String
        var date: Date
        var receipt: UIImage?
    }

    /// Same document as FeesMyExpenses.jsx writes. firestore.rules check that it is
    /// attributed to the caller, and that a wallet expense targets their own staff record.
    static func create(_ draft: Draft, email: String, staffId: String?) async throws -> String {
        let email = email.lowercased()
        var attachmentUrl = ""
        if let image = draft.receipt { attachmentUrl = try await uploadReceipt(image, email: email) }

        // Today's expense takes the server's clock; a backdated one is local midnight that
        // day, as the web stores it.
        let isToday = Calendar.current.isDateInToday(draft.date)
        var payload: [String: Any] = [
            "source": draft.source.rawValue,
            "type": draft.source.storedType,
            "amount": draft.amount,
            "category": draft.category.rawValue,
            "details": draft.details,
            "attachmentUrl": attachmentUrl,
            "createdBy": email,
            "timestamp": isToday ? FieldValue.serverTimestamp() : Timestamp(date: Calendar.current.startOfDay(for: draft.date)),
        ]
        if draft.source == .staffWallet {
            guard let staffId else { throw NSError(domain: "Expenses", code: 1, userInfo: [NSLocalizedDescriptionKey: "No staff record is linked to your account, so there's no wallet to charge."]) }
            payload["staffId"] = staffId
            payload["staffEmail"] = email
        }
        let ref = try await Firestore.firestore().collection("expenses").addDocument(data: payload)
        AuditLog.write(action: "EXPENSE_LOGGED", module: "fees_accounting", targetId: ref.documentID,
                       targetName: draft.details.isEmpty ? draft.category.rawValue : draft.details, email: email,
                       details: ["source": draft.source.rawValue, "amount": draft.amount, "category": draft.category.rawValue])
        return ref.documentID
    }

    static func delete(_ expense: Expense, email: String) async throws {
        try await Firestore.firestore().collection("expenses").document(expense.id).delete()
        AuditLog.write(action: "EXPENSE_DELETED", module: "fees_accounting", targetId: expense.id,
                       targetName: expense.details ?? expense.category, email: email,
                       details: ["source": expense.source, "amount": expense.amount, "category": expense.category])
    }

    /// expenses/{email}/{ms}_receipt.jpg, the folder storage.rules gives each person.
    /// Resized and compressed first (the web targets ~200 KB at 1280 px).
    static func uploadReceipt(_ image: UIImage, email: String) async throws -> String {
        guard let data = compressed(image) else {
            throw NSError(domain: "Expenses", code: 2, userInfo: [NSLocalizedDescriptionKey: "Couldn't read that photo."])
        }
        let ms = Int(Date().timeIntervalSince1970 * 1000)
        let ref = Storage.storage().reference(withPath: "expenses/\(email)/\(ms)_receipt.jpg")
        let meta = StorageMetadata()
        meta.contentType = "image/jpeg"
        meta.cacheControl = "public,max-age=31536000"
        _ = try await ref.putDataAsync(data, metadata: meta)
        return try await ref.downloadURL().absoluteString
    }

    static func compressed(_ image: UIImage, maxSide: CGFloat = 1280) -> Data? {
        let scale = min(1, maxSide / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.6)
    }
}
#endif
