#if os(iOS)
import SwiftUI
import AbhishriCore

/// Native FeesLedger.jsx. Every figure is the backend's financialSummary
/// (reconcileStudent), never recomputed here, so it matches the web and the reports.
struct FeesView: View {
    let profile: Profile
    let students: StudentsStore
    let router: AppRouter

    enum Show: String, CaseIterable, Identifiable {
        case all = "All", owing = "Owing", ahead = "Ahead", unconfigured = "Not set up"
        var id: String { rawValue }
    }
    enum Sort: String, CaseIterable, Identifiable {
        case name = "Name", due = "Amount due"
        var id: String { rawValue }
    }

    @State private var wing: Wing = .preschool
    @State private var show: Show = .all
    @State private var sort: Sort = .name
    @State private var search = ""
    /// Leavers stay listed by default: someone can leave owing money. This only drops
    /// the ones who have gone AND settled, like the web's checkbox.
    @State private var hideSettledLeavers = true
    @State private var path: [String] = DebugLaunch.openLedger.map { [$0] } ?? []

    private var inWing: [Student] { students.students.filter { $0.wing == wing } }

    private func isSettledLeaver(_ s: Student) -> Bool {
        !s.isOnRolls && (s.summary?.dueNow ?? 0) <= 0
    }

    private var visible: [Student] {
        let q = search.trimmingCharacters(in: .whitespaces)
        let list = inWing.filter { s in
            if hideSettledLeavers, isSettledLeaver(s) { return false }
            if !q.isEmpty, !s.name.localizedCaseInsensitiveContains(q) { return false }
            let status = s.summary?.status ?? "unconfigured"
            switch show {
            case .all: return true
            case .owing: return (s.summary?.dueNow ?? 0) > 0
            case .ahead: return (s.summary?.aheadBy ?? 0) > 0
            case .unconfigured: return status == "unconfigured"
            }
        }
        switch sort {
        case .name: return list
        case .due: return list.sorted { ($0.summary?.dueNow ?? 0) > ($1.summary?.dueNow ?? 0) }
        }
    }

    private var wingDue: Double { inWing.reduce(0) { $0 + ($1.summary?.dueNow ?? 0) } }

    private var owingLabel: String {
        let n = inWing.filter { ($0.summary?.dueNow ?? 0) > 0 }.count
        return n == 1 ? "1 student owing" : "\(n) students owing"
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    Picker("Wing", selection: $wing) {
                        ForEach(Wing.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                Section {
                    HStack {
                        StatTile(title: "Due now", value: students.loaded ? Money.inr(wingDue) : "—",
                                 detail: owingLabel,
                                 symbol: "exclamationmark.circle.fill", tint: Brand.absent)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                if let error = students.error {
                    Section { ErrorBanner(message: error) }
                }

                Section {
                    if !students.loaded {
                        HStack { Spacer(); ProgressView(); Spacer() }
                    } else if visible.isEmpty {
                        Text("Nothing to show.").foregroundStyle(.secondary)
                    } else {
                        ForEach(visible) { s in
                            NavigationLink(value: s.id) {
                                FeeRow(student: s)
                            }
                        }
                    }
                } header: {
                    Text("\(visible.count) students")
                } footer: {
                    let hidden = inWing.filter(isSettledLeaver).count
                    if hideSettledLeavers, hidden > 0 {
                        Text("\(hidden) settled students who have left are hidden.")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $search, prompt: "Search students")
            .navigationTitle("Fees")
            .navigationDestination(for: String.self) { id in
                if let s = students.student(id) {
                    StudentLedgerView(student: s, profile: profile, router: router)
                } else {
                    ProgressView()
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Show", selection: $show) {
                            ForEach(Show.allCases) { Text($0.rawValue).tag($0) }
                        }
                        Picker("Sort by", selection: $sort) {
                            ForEach(Sort.allCases) { Text($0.rawValue).tag($0) }
                        }
                        Toggle("Hide settled leavers", isOn: $hideSettledLeavers)
                    } label: {
                        Label("Filter", systemImage: show == .all ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                    }
                }
            }
        }
    }
}

struct FeeRow: View {
    let student: Student

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(student.name).font(.body.weight(.semibold)).lineLimit(1)
                HStack(spacing: 6) {
                    EnrollmentPill(student: student)
                    if let c = student.className { Text(c).font(.caption).foregroundStyle(.secondary) }
                }
            }
            Spacer()
            amount
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var amount: some View {
        if let s = student.summary, s.status != "unconfigured" {
            if s.dueNow > 0 {
                Text(Money.inr(s.dueNow)).font(.body.weight(.bold)).monospacedDigit().foregroundStyle(Brand.absent)
            } else if s.aheadBy > 0 {
                Text("+\(Money.inr(s.aheadBy))").font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(Brand.present)
            } else {
                Label("Clear", systemImage: "checkmark.circle.fill").labelStyle(.titleAndIcon)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Brand.present)
            }
        } else {
            Text("Not set up").font(.subheadline).foregroundStyle(.secondary)
        }
    }
}

struct FeeSummaryRows: View {
    let summary: FeeSummary
    let discontinued: Bool

    var body: some View {
        if summary.status == "unconfigured" {
            Text("No fee plan set up yet.").foregroundStyle(.secondary)
        } else {
            LabeledContent("Due now") {
                Text(Money.inr(summary.dueNow)).bold().monospacedDigit()
                    .foregroundStyle(summary.dueNow > 0 ? Brand.absent : .primary)
            }
            if summary.aheadBy > 0 {
                LabeledContent(discontinued ? "Refund due" : "Paid ahead") {
                    Text(Money.inr(summary.aheadBy)).monospacedDigit().foregroundStyle(Brand.present)
                }
            }
            LabeledContent("Paid") { Text(Money.inr(summary.totalPaid)).monospacedDigit() }
            if summary.totalDiscounted > 0 {
                LabeledContent("Concessions") { Text(Money.inr(summary.totalDiscounted)).monospacedDigit() }
            }
            // For a student who has left, the remaining balance IS the final settlement.
            LabeledContent(discontinued ? "Final settlement" : "Remaining this year") {
                Text(Money.inr(summary.annualRemaining)).monospacedDigit()
            }
            if discontinued, let months = summary.installmentsBilled {
                LabeledContent("Months billed", value: "\(months)")
            }
        }
    }
}

struct StudentLedgerView: View {
    let student: Student
    let profile: Profile
    let router: AppRouter
    @State private var ledger = LedgerStore()
    @State private var loggingPayment = false

    private var webPath: String { "/fee-collection/\(student.wing.rawValue)/\(student.id)" }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text(student.name).font(.title3.bold())
                        EnrollmentPill(student: student)
                    }
                    if let exit = student.exitDate {
                        Text("\(student.isOnRolls ? "Leaving" : "Left") \(exit.shortDay) — billed only up to the exit month.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }

            Section("Summary") {
                if let summary = student.summary {
                    FeeSummaryRows(summary: summary, discontinued: student.isDiscontinued)
                } else {
                    Text("No fee plan set up yet.").foregroundStyle(.secondary)
                }
            }

            Section {
                if profile.permissions.canLogPayment {
                    Button {
                        loggingPayment = true
                    } label: {
                        Label("Log a payment", systemImage: "plus.circle.fill")
                    }
                }
                Button {
                    router.openWeb(webPath)
                } label: {
                    Label("Full ledger, receipts & printing", systemImage: "doc.text.magnifyingglass")
                }
            } footer: {
                Text("Concessions, voids, corrections and receipts are on the full ledger in the More tab.")
            }

            Section("Recent entries") {
                if let error = ledger.error {
                    ErrorBanner(message: error)
                } else if !ledger.loaded {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if ledger.entries.isEmpty {
                    Text("No payments recorded yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(ledger.entries) { LedgerRow(entry: $0) }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Ledger")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $loggingPayment) { PaymentSheet(student: student) }
        .onAppear {
            ledger.start(studentId: student.id)
            if DebugLaunch.paymentAmount != nil, profile.permissions.canLogPayment { loggingPayment = true }
        }
        .onDisappear { ledger.stop() }
    }
}

struct LedgerRow: View {
    let entry: LedgerEntry

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(entry.description).font(.subheadline.weight(.semibold)).lineLimit(1)
                    switch entry.kind {
                    case .discount: Pill(text: "Concession", color: Brand.teal)
                    case .void: Pill(text: "Reversal", color: .secondary)
                    case .incoming: if entry.isVoided { Pill(text: "Voided", color: .secondary) }
                    }
                }
                Text([entry.method, entry.date?.shortDay, entry.externalRef.map { "Ref \($0)" }].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(Money.inr(entry.amount))
                .font(.subheadline.weight(.bold)).monospacedDigit()
                .strikethrough(entry.isVoided)
                .foregroundStyle(entry.isVoided || entry.kind == .void ? .secondary : entry.kind == .discount ? Brand.teal : .primary)
        }
        .padding(.vertical, 2)
    }
}
#endif
