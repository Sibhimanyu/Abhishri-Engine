#if os(iOS)
import SwiftUI
import AbhishriCore

/// Native StaffDirectory.jsx / StaffProfile.jsx (read-only; editing stays on the site).
struct StaffDirectoryView: View {
    let profile: Profile
    let router: AppRouter
    @State private var store = StaffStore()
    @State private var search = ""

    private var visible: [StaffMember] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? store.staff : store.staff.filter {
            $0.name.localizedCaseInsensitiveContains(q) || ($0.designation ?? "").localizedCaseInsensitiveContains(q)
        }
    }

    var body: some View {
        List {
            if let error = store.error { Section { ErrorBanner(message: error) } }
            Section {
                if !store.loaded {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if visible.isEmpty {
                    Text(search.isEmpty ? "No staff yet." : "No matches for “\(search)”.").foregroundStyle(.secondary)
                } else {
                    ForEach(visible) { member in
                        NavigationLink {
                            StaffDetailView(member: member, profile: profile, router: router)
                        } label: {
                            HStack(spacing: 12) {
                                Avatar(initials: member.initials)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(member.name).font(.body.weight(.semibold))
                                    if let d = member.designation { Text(d).font(.caption).foregroundStyle(.secondary) }
                                }
                            }
                        }
                    }
                }
            } header: {
                if store.loaded { Text("\(store.staff.count) staff") }
            }
        }
        .listStyle(.insetGrouped)
        .searchable(text: $search, prompt: "Search staff")
        .navigationTitle("Staff")
        .task { if !store.loaded { await store.load() } }
        .refreshable { await store.load() }
    }
}

struct StaffDetailView: View {
    let member: StaffMember
    let profile: Profile
    let router: AppRouter

    private var isMe: Bool { member.email != nil && member.email == profile.email.lowercased() }
    /// StaffProfile.jsx: admins see everyone's wallet; others only their own, with wallet_view_own.
    private var canSeeWallet: Bool {
        profile.permissions.isAdmin || (isMe && profile.permissions.can("fees_accounting", "wallet_view_own"))
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Avatar(initials: member.initials, size: 60)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(member.name).font(.title3.bold())
                        HStack(spacing: 6) {
                            if let d = member.designation { Pill(text: d, color: Brand.teal) }
                            ForEach(member.wings, id: \.self) { Pill(text: $0) }
                        }
                    }
                }
                .padding(.vertical, 4)
            }

            if member.phone != nil || member.email != nil {
                Section("Contact") {
                    if let phone = member.phone, let digits = Phone.digits(phone) {
                        HStack(spacing: 12) {
                            Text(phone).monospacedDigit()
                            Spacer()
                            if let tel = URL(string: "tel:\(digits)") {
                                Link(destination: tel) { Image(systemName: "phone.fill").frame(width: 36, height: 36) }
                                    .buttonStyle(.bordered).buttonBorderShape(.circle)
                                    .accessibilityLabel("Call")
                            }
                            if let wa = Phone.whatsApp(digits) {
                                Link(destination: wa) { Image(systemName: "message.fill").frame(width: 36, height: 36) }
                                    .buttonStyle(.bordered).buttonBorderShape(.circle).tint(.green)
                                    .accessibilityLabel("WhatsApp")
                            }
                        }
                    }
                    if let email = member.email, let url = URL(string: "mailto:\(email)") { Link(email, destination: url) }
                }
            }

            let rows: [(String, String?)] = [
                ("Joined", member.field("joiningDate")),
                ("Blood group", member.field("bloodGroup")),
                ("Date of birth", member.field("dob")),
                ("Emergency contact", member.field("emergencyContact")),
                ("Address", member.field("address")),
            ]
            let present = rows.compactMap { l, v in v.map { (l, $0) } }
            if !present.isEmpty {
                Section("Details") {
                    ForEach(present, id: \.0) { l, v in LabeledContent(l) { Text(v).multilineTextAlignment(.trailing) } }
                }
            }

            if canSeeWallet, let balance = member.walletBalance {
                Section("Wallet") {
                    LabeledContent("Balance") {
                        Text(Money.inr(balance)).bold().monospacedDigit().foregroundStyle(balance < 0 ? Brand.absent : Brand.present)
                    }
                    if !isMe {
                        Button { router.openWeb("/accounting") } label: { Label("Fund or review on the full site", systemImage: "arrow.up.right.square") }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(member.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
#endif
