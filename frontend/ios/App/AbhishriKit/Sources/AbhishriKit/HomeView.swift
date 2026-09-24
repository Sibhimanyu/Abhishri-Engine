#if os(iOS)
import SwiftUI
import AbhishriCore

struct HomeView: View {
    let profile: Profile
    let session: Session
    let students: StudentsStore
    let router: AppRouter

    @State private var today = AttendanceDay()
    @State private var payments = RecentPaymentsStore()
    @State private var confirmSignOut = false
    @State private var path: [HomeRoute] = DebugLaunch.homeRoute.map { [$0] } ?? []

    enum HomeRoute: Hashable { case expenses(logNow: Bool), staff }

    private var perms: Permissions { profile.permissions }
    private var todayKey: String { DateKeys.key(Date()) }

    /// On the rolls today (a student serving notice still counts), as the web dashboard.
    private var onRolls: [Student] { students.students.filter { $0.isEnrolled(on: Date()) } }

    private var greeting: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case ..<12: "Good morning"
        case ..<17: "Good afternoon"
        default: "Good evening"
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(Date().formatted(.dateTime.weekday(.wide).day().month(.wide)))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    if let error = students.error { ErrorBanner(message: error) }

                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                        if perms.canViewStudents {
                            StatTile(
                                title: "Students",
                                value: students.loaded ? "\(onRolls.count)" : "—",
                                detail: wingBreakdown,
                                symbol: "person.2.fill"
                            )
                        }
                        if perms.canViewAttendance {
                            StatTile(
                                title: "Present today",
                                value: today.loaded && students.loaded ? "\(presentToday)" : "—",
                                detail: today.loaded ? "\(markedToday) of \(onRolls.count) marked" : nil,
                                symbol: "checkmark.circle.fill",
                                tint: Brand.present
                            )
                        }
                        if perms.canViewFees {
                            StatTile(
                                title: "Dues outstanding",
                                value: students.loaded ? Money.inr(duesOutstanding) : "—",
                                detail: students.loaded ? (studentsInArrears == 1 ? "1 student" : "\(studentsInArrears) students") : nil,
                                symbol: "exclamationmark.circle.fill",
                                tint: Brand.absent
                            )
                        }
                        if perms.canViewRevenue {
                            StatTile(
                                title: "Received this month",
                                value: payments.loaded ? Money.inr(payments.receivedThisMonth) : "—",
                                detail: "Net of voids",
                                symbol: "indianrupeesign.circle.fill",
                                tint: Brand.teal
                            )
                        }
                    }

                    quickActions

                    teamSection

                    if perms.canViewRevenue, !payments.recent.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Recent payments").font(.headline)
                            VStack(spacing: 0) {
                                ForEach(payments.recent) { p in
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(p.studentName ?? "Unknown").font(.subheadline.weight(.semibold))
                                            Text([p.method, p.date?.shortDay].compactMap { $0 }.joined(separator: " · "))
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        Text(Money.inr(p.amount)).font(.subheadline.weight(.bold)).monospacedDigit()
                                    }
                                    .padding(.vertical, 10)
                                    .padding(.horizontal, 14)
                                    if p.id != payments.recent.last?.id { Divider().padding(.leading, 14) }
                                }
                            }
                            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationDestination(for: HomeRoute.self) { route in
                switch route {
                case .expenses(let logNow): MyExpensesView(profile: profile, openLogOnAppear: logNow)
                case .staff: StaffDirectoryView(profile: profile, router: router)
                }
            }
            .navigationTitle("\(greeting), \(firstName)")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Section(profile.email) {
                            Label(profile.role.capitalized, systemImage: "person.badge.key")
                        }
                        Button(role: .destructive) { confirmSignOut = true } label: {
                            Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    } label: {
                        Avatar(initials: initials(profile.name), size: 32)
                    }
                    .accessibilityLabel("Account")
                }
            }
            .confirmationDialog("Sign out of Abhishri?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Task { await session.signOut() } }
            }
        }
        .onAppear {
            if perms.canViewAttendance { today.observe(.students, day: todayKey) }
            if perms.canViewRevenue { payments.start() }
        }
        .onDisappear {
            today.stop()
            payments.stop()
        }
    }

    private struct QuickAction: Identifiable {
        let title: String
        let symbol: String
        let action: () -> Void
        var id: String { title }
    }

    private var actions: [QuickAction] {
        var out: [QuickAction] = []
        if perms.canMarkAttendance {
            out.append(QuickAction(title: "Mark attendance", symbol: "checklist.checked") { router.tab = .attendance })
        }
        if perms.canManageStudents {
            out.append(QuickAction(title: "Add student", symbol: "person.badge.plus") { router.openWeb("/students") })
        }
        if canLogExpenses {
            out.append(QuickAction(title: "Log expense", symbol: "creditcard") { path.append(.expenses(logNow: true)) })
        }
        if perms.can("whatsapp_sender", "access") {
            out.append(QuickAction(title: "WhatsApp", symbol: "message.fill") { router.openWeb("/whatsapp") })
        }
        return out
    }

    @ViewBuilder
    private var quickActions: some View {
        if !actions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Quick actions").font(.headline)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(actions) { item in
                        Button(action: item.action) {
                            Label(item.title, systemImage: item.symbol)
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                .padding(.horizontal, 14)
                                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// firestore.rules let any internal staff member (everyone who reaches these native
    /// screens) log expenses attributed to themselves, so this is always on for staff.
    private var canLogExpenses: Bool { true }

    @ViewBuilder
    private var teamSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("You & your team").font(.headline)
            VStack(spacing: 0) {
                if canLogExpenses {
                    NavigationLink(value: HomeRoute.expenses(logNow: false)) {
                        rowLabel("My wallet & expenses", symbol: "wallet.bifold.fill", tint: Brand.teal)
                    }
                }
                if canLogExpenses && perms.canViewStaff { Divider().padding(.leading, 52) }
                if perms.canViewStaff {
                    NavigationLink(value: HomeRoute.staff) {
                        rowLabel("Staff directory", symbol: "person.crop.rectangle.stack.fill", tint: Brand.coral)
                    }
                }
            }
            .buttonStyle(.plain)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func rowLabel(_ title: String, symbol: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).foregroundStyle(tint).frame(width: 28)
            Text(title).font(.subheadline.weight(.semibold))
            Spacer()
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 50)
        .contentShape(Rectangle())
    }

    private var firstName: String { String(profile.name.split(separator: " ").first ?? "") }

    private var wingBreakdown: String? {
        guard students.loaded else { return nil }
        let pre = onRolls.filter { $0.wing == .preschool }.count
        return "\(pre) preschool · \(onRolls.count - pre) tuition"
    }

    private var markedToday: Int { onRolls.filter { today.statuses[$0.id] != nil }.count }

    /// Present or late, like the web's attendance percentage.
    private var presentToday: Int {
        onRolls.filter { today.statuses[$0.id] == .present || today.statuses[$0.id] == .late }.count
    }

    /// Every student still owing, leavers included: someone can leave owing money, and
    /// hiding them would hide the arrears.
    private var duesOutstanding: Double { students.students.reduce(0) { $0 + ($1.summary?.dueNow ?? 0) } }
    private var studentsInArrears: Int { students.students.filter { ($0.summary?.dueNow ?? 0) > 0 }.count }

    private func initials(_ name: String) -> String {
        name.split(separator: " ").prefix(2).compactMap { $0.first.map(String.init) }.joined().uppercased()
    }
}
#endif
