#if os(iOS)
import SwiftUI
import AbhishriCore

/// Native StudentDirectory.jsx. "Active" means on the rolls today, so a student serving
/// out notice stays in Active (tagged "Leaving …") until their exit date passes.
struct StudentsView: View {
    let profile: Profile
    let students: StudentsStore
    let router: AppRouter

    enum Filter: String, CaseIterable, Identifiable {
        case active = "Active", discontinued = "Discontinued", all = "All"
        var id: String { rawValue }
    }

    @State private var wing: Wing = .preschool
    @State private var filter: Filter = .active
    @State private var search = ""
    @State private var path: [String] = DebugLaunch.openStudent.map { [$0] } ?? []

    private var inWing: [Student] { students.students.filter { $0.wing == wing } }

    private var visible: [Student] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return inWing.filter { s in
            switch filter {
            case .active: guard s.isOnRolls else { return false }
            case .discontinued: guard !s.isOnRolls else { return false }
            case .all: break
            }
            return q.isEmpty || s.name.localizedCaseInsensitiveContains(q)
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    Picker("Wing", selection: $wing) {
                        ForEach(Wing.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Picker("Show", selection: $filter) {
                        ForEach(Filter.allCases) { f in
                            Text(label(for: f)).tag(f)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))

                if let error = students.error {
                    Section { ErrorBanner(message: error) }
                }

                Section {
                    if !students.loaded {
                        HStack { Spacer(); ProgressView(); Spacer() }
                    } else if visible.isEmpty {
                        Text(search.isEmpty ? "No students here." : "No matches for “\(search)”.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(visible) { student in
                            NavigationLink(value: student.id) {
                                StudentRow(student: student)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $search, prompt: "Search students")
            .navigationTitle("Students")
            .navigationDestination(for: String.self) { id in
                StudentDetailView(studentId: id, profile: profile, students: students, router: router)
            }
            .toolbar {
                if profile.permissions.canManageStudents {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            router.openWeb("/students")
                        } label: {
                            Label("Add student", systemImage: "person.badge.plus")
                        }
                    }
                }
            }
        }
    }

    private func label(for f: Filter) -> String {
        guard students.loaded else { return f.rawValue }
        switch f {
        case .active: return "Active (\(inWing.filter(\.isOnRolls).count))"
        case .discontinued: return "Left (\(inWing.filter { !$0.isOnRolls }.count))"
        case .all: return "All"
        }
    }
}

struct StudentRow: View {
    let student: Student

    var body: some View {
        HStack(spacing: 12) {
            Avatar(initials: student.initials)
            VStack(alignment: .leading, spacing: 3) {
                Text(student.name).font(.body.weight(.semibold)).lineLimit(1)
                HStack(spacing: 6) {
                    if let c = student.className { Text(c).font(.caption).foregroundStyle(.secondary) }
                    EnrollmentPill(student: student)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

struct StudentDetailView: View {
    let studentId: String
    let profile: Profile
    let students: StudentsStore
    let router: AppRouter

    private var student: Student? { students.student(studentId) }

    var body: some View {
        Group {
            if let student {
                content(student)
            } else if students.loaded {
                ContentUnavailableView("Student not found", systemImage: "person.fill.questionmark")
            } else {
                ProgressView()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func content(_ s: Student) -> some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Avatar(initials: s.initials, size: 60)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(s.name).font(.title3.bold())
                        HStack(spacing: 6) {
                            Pill(text: s.wing.label, color: s.wing == .preschool ? Brand.teal : .yellow)
                            if let c = s.className { Pill(text: c) }
                            EnrollmentPill(student: s)
                        }
                    }
                }
                .padding(.vertical, 4)
            }

            if s.isDiscontinued {
                Section("Enrollment") {
                    if let exit = s.exitDate {
                        LabeledContent(s.isOnRolls ? "Leaving on" : "Last day", value: exit.shortDay)
                    }
                    if let reason = s.discontinuation.string("reason") { LabeledContent("Reason", value: reason) }
                    if let notes = s.discontinuation.string("notes") { Text(notes).font(.callout).foregroundStyle(.secondary) }
                    Text(s.discontinuation.bool("waiveFinalMonth")
                         ? "Fees stop accruing from the exit month."
                         : "Fees stop accruing after the exit month.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }

            if profile.permissions.canViewFees, let summary = s.summary {
                Section("Fees") {
                    FeeSummaryRows(summary: summary, discontinued: s.isDiscontinued)
                    NavigationLink {
                        StudentLedgerView(student: s, profile: profile, router: router)
                    } label: {
                        Label("View ledger", systemImage: "list.bullet.rectangle")
                    }
                }
            }

            ParentSection(title: "Mother", name: s.field("motherName"), phone: s.field("motherPhone"), email: s.field("motherEmail"), occupation: s.field("motherOccupation"))
            ParentSection(title: "Father", name: s.field("fatherName"), phone: s.field("fatherPhone"), email: s.field("fatherEmail"), occupation: s.field("fatherOccupation"))

            if s.field("emergencyContactName") != nil || s.field("emergencyPhone") != nil {
                ParentSection(title: "Emergency contact", name: s.field("emergencyContactName"), phone: s.field("emergencyPhone"),
                              email: nil, occupation: s.field("emergencyRelationship"))
            }

            detailSection("Student", [
                ("Date of birth", s.field("dob")),
                ("Gender", s.field("gender")),
                ("Admission no.", s.field("appNumber")),
                ("Enrolled", s.field("enrollmentDate")),
            ])

            detailSection("Health", [
                ("Allergies", s.field("allergiesList")),
                ("Medical conditions", s.field("medicalConditions")),
                ("Physician", [s.field("physicianName"), s.field("physicianPhone")].compactMap { $0 }.joined(separator: " · ").nilIfEmpty),
            ])

            detailSection("Address", [
                ("Address", [s.field("address"), s.field("city"), s.field("state"), s.field("pinCode")].compactMap { $0 }.joined(separator: ", ").nilIfEmpty),
            ])

            if profile.permissions.canManageStudents {
                Section {
                    Button {
                        router.openWeb("/students")
                    } label: {
                        Label("Edit or discontinue on the full site", systemImage: "square.and.pencil")
                    }
                } footer: {
                    Text("Editing a profile, discontinuing and re-enrolling open in the More tab.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(s.name)
    }

    @ViewBuilder
    private func detailSection(_ title: String, _ rows: [(String, String?)]) -> some View {
        let present = rows.compactMap { label, value in value.map { (label, $0) } }
        if !present.isEmpty {
            Section(title) {
                ForEach(present, id: \.0) { label, value in
                    LabeledContent(label) { Text(value).multilineTextAlignment(.trailing) }
                }
            }
        }
    }
}

/// A parent (or emergency contact) with one-tap call and WhatsApp.
struct ParentSection: View {
    let title: String
    let name: String?
    let phone: String?
    let email: String?
    let occupation: String?

    var body: some View {
        if name != nil || phone != nil {
            Section(title) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(name ?? "—").font(.body.weight(.semibold))
                    if let occupation { Text(occupation).font(.caption).foregroundStyle(.secondary) }
                }
                if let phone, let digits = Phone.digits(phone) {
                    HStack(spacing: 12) {
                        Text(phone).monospacedDigit()
                        Spacer()
                        if let tel = URL(string: "tel:\(digits)") {
                            Link(destination: tel) { Image(systemName: "phone.fill").frame(width: 36, height: 36) }
                                .buttonStyle(.bordered).buttonBorderShape(.circle)
                                .accessibilityLabel("Call \(title.lowercased())")
                        }
                        if let wa = Phone.whatsApp(digits) {
                            Link(destination: wa) { Image(systemName: "message.fill").frame(width: 36, height: 36) }
                                .buttonStyle(.bordered).buttonBorderShape(.circle).tint(.green)
                                .accessibilityLabel("WhatsApp \(title.lowercased())")
                        }
                    }
                }
                if let email, let url = URL(string: "mailto:\(email)") {
                    Link(email, destination: url)
                }
            }
        }
    }
}

enum Phone {
    /// Digits only; nil when there aren't enough to dial.
    static func digits(_ raw: String) -> String? {
        let d = raw.filter(\.isNumber)
        return d.count >= 10 ? d : nil
    }

    /// wa.me link. The directory stores Indian numbers with or without the 91 prefix
    /// (the web normalises to the last 10 digits the same way).
    static func whatsApp(_ digits: String) -> URL? {
        let national = String(digits.suffix(10))
        return URL(string: "https://wa.me/91\(national)")
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
#endif
