#if os(iOS)
import SwiftUI
import PhotosUI
import AbhishriCore

/// Native FeesMyExpenses.jsx: the signed-in staff member's wallet and expenses.
struct MyExpensesView: View {
    let profile: Profile
    /// Straight into the form (Home's "Log expense" quick action).
    var openLogOnAppear = false
    @State private var store = MyExpensesStore()
    @State private var logging = false
    @State private var confirmDelete: Expense?
    @State private var deleteError: String?
    @State private var openedOnce = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    if store.staff != nil {
                        StatTile(title: "Wallet balance", value: store.loaded ? Money.inr(store.walletBalance) : "—",
                                 detail: store.walletBalance < 0 ? "The school owes you this" : "Float in hand",
                                 symbol: "wallet.bifold.fill", tint: store.walletBalance < 0 ? Brand.absent : Brand.present)
                    }
                    StatTile(title: "Spent this month", value: store.loaded ? Money.inr(store.spentThisMonth) : "—",
                             symbol: "creditcard.fill", tint: Brand.teal)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            if let error = store.error { Section { ErrorBanner(message: error) } }

            Section {
                if !store.loaded {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if store.expenses.isEmpty {
                    Text("Nothing logged yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(store.expenses) { e in
                        ExpenseRow(expense: e)
                            .swipeActions {
                                // firestore.rules only let you delete what you logged yourself.
                                if e.createdBy == profile.email.lowercased() && !e.isFunding {
                                    Button(role: .destructive) { confirmDelete = e } label: { Label("Delete", systemImage: "trash") }
                                }
                            }
                    }
                }
            } header: {
                Text("History")
            } footer: {
                if store.loaded, !store.expenses.isEmpty { Text("Swipe left on an expense you logged to delete it. Editing is on the full site.") }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("My expenses")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { logging = true } label: { Label("Log expense", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $logging) {
            ExpenseSheet(email: profile.email, store: store)
        }
        .confirmationDialog("Delete this expense?", isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
                            titleVisibility: .visible, presenting: confirmDelete) { e in
            Button("Delete \(Money.inr(e.amount))", role: .destructive) {
                Task {
                    do { try await ExpenseService.delete(e, email: profile.email) }
                    catch { deleteError = "You can only delete expenses you logged yourself. (\(error.localizedDescription))" }
                }
            }
        } message: { e in Text(e.title) }
        .alert("Couldn't delete", isPresented: Binding(get: { deleteError != nil }, set: { if !$0 { deleteError = nil } }), presenting: deleteError) { _ in
            Button("OK") {}
        } message: { Text($0) }
        .onAppear {
            store.start(email: profile.email)
            if openLogOnAppear, !openedOnce { openedOnce = true; logging = true }
        }
        .onDisappear { store.stop() }
    }
}

struct ExpenseRow: View {
    let expense: Expense

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: expense.isFunding ? "arrow.down.circle.fill" : expense.categorySymbol)
                .foregroundStyle(expense.isFunding ? Brand.present : Brand.coral)
                .frame(width: 32, height: 32)
                .background((expense.isFunding ? Brand.present : Brand.coral).opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(expense.isFunding ? "Wallet top-up" : expense.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                HStack(spacing: 6) {
                    if let d = expense.date { Text(d.shortDay) }
                    Text(expense.isWallet ? "Wallet" : "School paid")
                    if expense.attachmentUrl != nil { Image(systemName: "paperclip") }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(expense.isFunding ? "+" : "")\(Money.inr(expense.amount))")
                .font(.subheadline.weight(.bold)).monospacedDigit()
                .foregroundStyle(expense.isFunding ? Brand.present : .primary)
        }
        .padding(.vertical, 2)
        .contextMenu {
            if let url = expense.attachmentUrl { Link(destination: url) { Label("Open receipt", systemImage: "doc.richtext") } }
        }
    }
}

struct ExpenseSheet: View {
    let email: String
    /// Read live: the form can open before the staff record has loaded (Home's quick
    /// action), and the wallet option must appear as soon as it does.
    let store: MyExpensesStore
    private var staffId: String? { store.staff?.id }
    @Environment(\.dismiss) private var dismiss

    @State private var source: ExpenseSource = .office
    @State private var amountText = ""
    @State private var category: ExpenseCategory = .officeSupplies
    @State private var details = ""
    @State private var date = Date()
    @State private var receipt: UIImage?
    @State private var photoItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var saving = false
    @State private var error: String?

    private var amount: Double? {
        let v = Double(amountText.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces))
        return (v ?? 0) > 0 ? v : nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Paid by") {
                    Picker("Paid by", selection: $source) {
                        Text(ExpenseSource.office.label).tag(ExpenseSource.office)
                        if staffId != nil { Text(ExpenseSource.staffWallet.label).tag(ExpenseSource.staffWallet) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                Section {
                    HStack {
                        Text("₹").foregroundStyle(.secondary)
                        TextField("Amount", text: $amountText).keyboardType(.decimalPad).font(.title3.weight(.semibold)).monospacedDigit()
                    }
                    Picker("Category", selection: $category) {
                        ForEach(ExpenseCategory.allCases) { Label($0.label, systemImage: $0.symbol).tag($0) }
                    }
                    TextField("What was it for?", text: $details)
                    DatePicker("Date", selection: $date, in: ...Date(), displayedComponents: .date)
                }

                Section("Receipt") {
                    if let receipt {
                        Image(uiImage: receipt).resizable().scaledToFit().frame(maxHeight: 180)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        Button("Remove photo", role: .destructive) { self.receipt = nil; photoItem = nil }
                    }
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button { showCamera = true } label: { Label("Take photo", systemImage: "camera") }
                    }
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        Label(receipt == nil ? "Choose photo" : "Choose a different photo", systemImage: "photo")
                    }
                }

                if let error { Section { ErrorBanner(message: error) } }
            }
            .disabled(saving)
            .navigationTitle("Log expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button("Save") { Task { await save() } }.disabled(amount == nil)
                    }
                }
            }
            .onChange(of: photoItem) { _, item in
                Task {
                    if let data = try? await item?.loadTransferable(type: Data.self), let image = UIImage(data: data) { receipt = image }
                }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker(image: $receipt).ignoresSafeArea()
            }
            .interactiveDismissDisabled(saving)
            .task(id: staffId) {
                // Debug-only (DebugLaunch): once the staff record is known, fill and save.
                guard let preset = DebugLaunch.expenseAmount, amountText.isEmpty, staffId != nil else { return }
                amountText = preset
                details = "Chart paper and markers"
                source = .staffWallet
                if DebugLaunch.expenseAutoSubmit { await save() }
            }
        }
    }

    private func save() async {
        guard let amount else { return }
        saving = true
        defer { saving = false }
        do {
            _ = try await ExpenseService.create(
                .init(source: source, amount: amount, category: category, details: details.trimmingCharacters(in: .whitespaces), date: date, receipt: receipt),
                email: email, staffId: staffId)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            dismiss()
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            self.error = error.localizedDescription
        }
    }
}

/// The system camera, for photographing a receipt.
struct CameraPicker: UIViewControllerRepresentable {
    @Binding var image: UIImage?
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            parent.image = info[.originalImage] as? UIImage
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}
#endif
