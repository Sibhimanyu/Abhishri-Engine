#if os(iOS)
import SwiftUI
import AbhishriCore

/// Native "Log a payment". Every check that matters happens on the server (logPayment);
/// this form only catches the obvious before sending and shows the server's answer.
struct PaymentSheet: View {
    let student: Student
    @Environment(\.dismiss) private var dismiss

    @State private var amountText = ""
    @State private var method: PaymentMethod = .cash
    @State private var backdate = false
    @State private var receivedOn = Date()
    @State private var reference = ""
    @State private var note = ""
    @State private var sending = false
    @State private var error: String?
    @State private var recorded: PaymentService.Recorded?
    /// One key per sheet: a retry after a dropped connection resends the same key, and
    /// the server answers with the payment it already recorded instead of a second one.
    @State private var idempotencyKey = UUID().uuidString.lowercased()
    @FocusState private var amountFocused: Bool

    private var amount: Double? {
        let cleaned = amountText.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces)
        guard let v = Double(cleaned), v > 0, v.isFinite else { return nil }
        return v
    }

    private var formProblem: String? {
        if amount == nil { return "Enter the amount received." }
        let refError = method.validateReference(reference)
        return refError.isEmpty ? nil : refError
    }

    var body: some View {
        NavigationStack {
            Group {
                if let recorded { confirmation(recorded) } else { form }
            }
            .navigationTitle(recorded == nil ? "Log a payment" : "Payment recorded")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if recorded == nil { Button("Cancel") { dismiss() }.disabled(sending) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if recorded == nil {
                        Button("Record") { Task { await submit() } }
                            .disabled(sending || formProblem != nil)
                    } else {
                        Button("Done") { dismiss() }
                    }
                }
            }
            .interactiveDismissDisabled(sending)
        }
    }

    private var form: some View {
        Form {
            Section {
                LabeledContent("Student", value: student.name)
                if let s = student.summary, s.status != "unconfigured" {
                    LabeledContent("Due now") {
                        Text(Money.inr(s.dueNow)).monospacedDigit().foregroundStyle(s.dueNow > 0 ? Brand.absent : .secondary)
                    }
                    if s.dueNow > 0 {
                        Button("Fill in \(Money.inr(s.dueNow))") { amountText = String(Int(s.dueNow.rounded())) }
                    }
                }
            }

            Section {
                HStack {
                    Text("₹").foregroundStyle(.secondary)
                    TextField("Amount", text: $amountText)
                        .keyboardType(.decimalPad)
                        .focused($amountFocused)
                        .font(.title3.weight(.semibold))
                        .monospacedDigit()
                }
                Picker("Method", selection: $method) {
                    ForEach(PaymentMethod.allCases) { Text($0.label).tag($0) }
                }
                if method.requiresReference {
                    TextField("Reference number (required)", text: $reference)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }
                TextField("Note (optional)", text: $note)
            } header: {
                Text("Payment")
            } footer: {
                if method.requiresReference {
                    Text("The UPI / NEFT / cheque / card reference lets this payment be matched to the bank statement.")
                }
            }

            Section {
                Toggle("Received on an earlier day", isOn: $backdate)
                if backdate {
                    DatePicker("Received on", selection: $receivedOn, in: ...Date(), displayedComponents: .date)
                }
            } footer: {
                Text("The amount is split across the dues automatically, oldest first, the same way the website does.")
            }

            if let error {
                Section { ErrorBanner(message: error) }
            }

            if sending {
                Section { HStack { Spacer(); ProgressView("Recording…"); Spacer() } }
            }
        }
        .disabled(sending)
        .onAppear {
            amountFocused = true
            if let preset = DebugLaunch.paymentAmount, amountText.isEmpty {
                amountText = preset
                if DebugLaunch.paymentAutoSubmit { Task { await submit() } }
            }
        }
    }

    private func confirmation(_ r: PaymentService.Recorded) -> some View {
        List {
            Section {
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 48)).foregroundStyle(Brand.present)
                    Text(Money.inr(amount ?? 0)).font(.largeTitle.bold()).monospacedDigit()
                    Text("\(method.label) · \(student.name)").foregroundStyle(.secondary)
                    if r.duplicate {
                        Text("This payment was already recorded; it was not added again.")
                            .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            if !r.lines.isEmpty {
                Section("Applied to") {
                    ForEach(r.lines, id: \.label) { line in
                        LabeledContent(line.label) { Text(Money.inr(line.amount)).monospacedDigit() }
                    }
                }
            }
            Section {
                Text("Receipts and printing are on the full ledger in the More tab. The dues update in a few seconds.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func submit() async {
        guard let amount, formProblem == nil else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            recorded = try await PaymentService.log(
                studentId: student.id,
                amount: amount,
                method: method,
                description: note,
                receivedOn: backdate ? receivedOn : nil,
                externalRef: method.requiresReference ? reference : "",
                idempotencyKey: idempotencyKey
            )
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            self.error = PaymentService.describe(error)
        }
    }
}
#endif
