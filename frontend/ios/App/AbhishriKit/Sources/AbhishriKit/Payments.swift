#if os(iOS)
import Foundation
import FirebaseFunctions
import AbhishriCore

/// The logPayment callable (functions/src/fees/payments.js): the one write path for
/// payments, shared with the web ledger. It checks permission, the reference and the
/// accounting period, splits the amount across fee lines with the dues engine's rules,
/// and writes the payment and its audit entry together.
enum PaymentService {
    struct Recorded {
        let id: String
        let duplicate: Bool
        let lines: [BreakdownLine]
    }

    static func log(
        studentId: String,
        amount: Double,
        method: PaymentMethod,
        description: String,
        receivedOn: Date?,
        externalRef: String,
        idempotencyKey: String
    ) async throws -> Recorded {
        var data: [String: Any] = [
            "studentId": studentId,
            "amount": amount,
            "method": method.rawValue,
            "description": description.isEmpty ? "Fee Payment" : description,
            "externalRef": externalRef.trimmingCharacters(in: .whitespacesAndNewlines),
            "idempotencyKey": idempotencyKey,
            "recordedVia": "ios",
        ]
        // A backdated payment is sent as its local calendar day; the server dates it
        // midnight IST that day, as the web always has.
        if let receivedOn { data["receivedOn"] = DateKeys.key(receivedOn) }

        let result = try await Functions.functions().httpsCallable("logPayment").call(data)
        let body = result.data as? [String: Any] ?? [:]
        let breakdown = (body["breakdown"] as? [String: Any] ?? [:]).compactMapValues { ($0 as? NSNumber)?.doubleValue }
        let names = body["breakdownNames"] as? [String: String] ?? [:]
        return Recorded(
            id: body["id"] as? String ?? idempotencyKey,
            duplicate: body["duplicate"] as? Bool ?? false,
            lines: PaymentBreakdown.lines(breakdown: breakdown, names: names)
        )
    }

    /// The server's own message ("2026-08 is closed for accounting…"), which already says
    /// what to fix, rather than a generic "INTERNAL".
    static func describe(_ error: Error) -> String {
        let ns = error as NSError
        if ns.domain == FunctionsErrorDomain {
            let code = FunctionsErrorCode(rawValue: ns.code)
            if code == .unavailable || code == .deadlineExceeded {
                return "Couldn't reach the server. Check your connection and try again — tapping Record again won't create a second payment."
            }
            if code == .internal { return "Something went wrong on the server. Try again; the same payment won't be recorded twice." }
        }
        return ns.localizedDescription
    }
}
#endif
