#if os(iOS)
import SwiftUI
import AbhishriCore

/// Native version of Attendance.jsx, with the same rules:
///   - the roster for a day is everyone enrolled ON that day (a leaver drops off after
///     their exit date; days away before a re-enrollment are excluded)
///   - future days can't be marked, and only people on that day's roster can be
///   - the 30-day report reads the per-day records and only counts enrolled days
struct AttendanceView: View {
    let profile: Profile
    let students: StudentsStore

    enum Group: String, CaseIterable, Identifiable {
        case preschool, tuition, staff
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
        var module: AttendanceModule { self == .staff ? .staff : .students }
    }
    enum Mode: String, CaseIterable, Identifiable {
        case mark = "Mark", report = "Report"
        var id: String { rawValue }
    }

    @State private var group: Group = .preschool
    @State private var mode: Mode = DebugLaunch.attendanceMode == "report" ? .report : .mark
    @State private var date = Date()
    @State private var search = ""
    @State private var day = AttendanceDay()
    @State private var staff = StaffStore()
    @State private var saveError: String?
    @State private var confirmMarkAll = false
    @State private var inFlight: Set<String> = []

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Group", selection: $group) {
                        ForEach(Group.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                if mode == .mark {
                    markSection
                } else {
                    AttendanceReport(group: group, entries: reportEntries)
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $search, prompt: "Search names")
            .navigationTitle("Attendance")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker("Mode", selection: $mode) {
                        ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 150)
                }
            }
            .alert("Couldn't save attendance", isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } }), presenting: saveError) { _ in
                Button("OK") { saveError = nil }
            } message: { Text($0) }
        }
        .task(id: "\(group.module.rawValue)|\(dayKey)|\(mode.rawValue)") {
            if mode == .mark { day.observe(group.module, day: dayKey) } else { day.stop() }
        }
        .task(id: group) {
            if group == .staff, !staff.loaded { await staff.load() }
        }
        .onDisappear { day.stop() }
    }

    // MARK: Mark

    private var dayKey: String { DateKeys.key(date) }
    private var isFuture: Bool { dayKey > DateKeys.key(Date()) }
    private var canMark: Bool { profile.permissions.canMarkAttendance && !isFuture }

    private struct Person: Identifiable {
        let id: String
        let name: String
        let subtitle: String?
        let student: Student?
    }

    /// Everyone on the sheet for the chosen day.
    private var roster: [Person] {
        if group == .staff {
            return staff.staff.map { Person(id: $0.id, name: $0.name, subtitle: $0.designation, student: nil) }
        }
        let wing: Wing = group == .tuition ? .tuition : .preschool
        return students.students
            .filter { $0.wing == wing && $0.isEnrolled(on: date) }
            .map { Person(id: $0.id, name: $0.name, subtitle: $0.className, student: $0) }
    }

    private var visibleRoster: [Person] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? roster : roster.filter { $0.name.localizedCaseInsensitiveContains(q) }
    }

    private var loaded: Bool { (group == .staff ? staff.loaded : students.loaded) && day.loaded }

    @ViewBuilder
    private var markSection: some View {
        Section {
            DatePicker("Date", selection: $date, in: ...Date(), displayedComponents: .date)
            summaryRow
            if canMark, unmarked.count > 0, !roster.isEmpty {
                Button {
                    confirmMarkAll = true
                } label: {
                    Label("Mark \(unmarked.count) unmarked as present", systemImage: "checkmark.circle")
                }
                .confirmationDialog("Mark \(unmarked.count) as present for \(date.shortDay)?", isPresented: $confirmMarkAll, titleVisibility: .visible) {
                    Button("Mark present") { Task { await markAllUnmarked() } }
                }
            }
            if !profile.permissions.canMarkAttendance {
                Label("You can view attendance but not mark it.", systemImage: "eye")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }

        if let error = day.error ?? (group == .staff ? staff.error : students.error) {
            Section { ErrorBanner(message: error) }
        }

        Section {
            if !loaded {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if roster.isEmpty {
                Text("No one on the roster for this day.").foregroundStyle(.secondary)
            } else {
                ForEach(visibleRoster) { person in
                    AttendanceRow(
                        name: person.name,
                        subtitle: person.subtitle,
                        student: person.student,
                        status: day.statuses[person.id],
                        enabled: canMark && !inFlight.contains(person.id)
                    ) { status in
                        Task { await mark(person.id, status) }
                    }
                }
            }
        } header: {
            if loaded, !roster.isEmpty { Text("\(roster.count) on the roster") }
        }
    }

    private var summaryRow: some View {
        let counts = Dictionary(grouping: roster.compactMap { day.statuses[$0.id] }, by: { $0 }).mapValues(\.count)
        return HStack {
            ForEach(AttendanceStatus.allCases) { s in
                VStack(spacing: 2) {
                    Text("\(counts[s] ?? 0)").font(.title3.bold()).monospacedDigit().foregroundStyle(s.color)
                    Text(s.label).font(.caption2).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
            }
            VStack(spacing: 2) {
                Text("\(unmarked.count)").font(.title3.bold()).monospacedDigit()
                Text("Unmarked").font(.caption2).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 4)
    }

    private var unmarked: [Person] { roster.filter { day.statuses[$0.id] == nil } }

    private func mark(_ id: String, _ status: AttendanceStatus) async {
        // Same guards as the web: the sheet may be stale, or the date changed under us.
        guard canMark, roster.contains(where: { $0.id == id }) else { return }
        inFlight.insert(id)
        defer { inFlight.remove(id) }
        do {
            try await AttendanceDay.mark(group.module, day: dayKey, id: id, status: status, by: profile.email)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            saveError = "\(error.localizedDescription)\n\nCheck your connection and permissions, then try again."
        }
    }

    private func markAllUnmarked() async {
        let targets = unmarked.map(\.id)
        for id in targets { await mark(id, .present) }
    }

    // MARK: Report

    private var reportEntries: [AttendanceReport.Entry] {
        if group == .staff {
            return staff.staff.map { .init(id: $0.id, name: $0.name, student: nil) }
        }
        let wing: Wing = group == .tuition ? .tuition : .preschool
        return students.students.filter { $0.wing == wing }.map { .init(id: $0.id, name: $0.name, student: $0) }
    }
}

struct AttendanceRow: View {
    let name: String
    let subtitle: String?
    let student: Student?
    let status: AttendanceStatus?
    let enabled: Bool
    let onMark: (AttendanceStatus) -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(name).font(.body.weight(.semibold)).lineLimit(1)
                HStack(spacing: 6) {
                    if let subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
                    if let student { EnrollmentPill(student: student) }
                }
            }
            Spacer(minLength: 8)
            HStack(spacing: 6) {
                ForEach(AttendanceStatus.allCases) { s in
                    Button {
                        onMark(s)
                    } label: {
                        Image(systemName: status == s ? s.symbol : s.symbol.replacingOccurrences(of: ".fill", with: ""))
                            .font(.title2)
                            .foregroundStyle(status == s ? s.color : Color.secondary.opacity(0.6))
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("\(s.label)\(status == s ? ", selected" : "")")
                }
            }
            .disabled(!enabled)
        }
        .padding(.vertical, 2)
    }
}

struct AttendanceReport: View {
    struct Entry: Identifiable {
        let id: String
        let name: String
        let student: Student?
    }

    static let days = 30
    let group: AttendanceView.Group
    let entries: [Entry]

    @State private var history: [String: [String: AttendanceStatus]] = [:]
    @State private var loading = true
    @State private var error: String?

    private struct Row: Identifiable {
        let entry: Entry
        var present = 0, absent = 0, late = 0
        var total: Int { present + absent + late }
        var id: String { entry.id }
        var percent: Int? { total == 0 ? nil : Int((Double(present + late) / Double(total) * 100).rounded()) }
    }

    /// Counts only days each person was enrolled on, and keeps leavers only while the
    /// window still covers days they attended.
    private var rows: [Row] {
        let today = Date()
        return entries.compactMap { e in
            var r = Row(entry: e)
            for (key, day) in history {
                guard let status = day[e.id], let date = DateKeys.date(fromKey: key) else { continue }
                if let s = e.student, !s.isEnrolled(on: date) { continue }
                switch status {
                case .present: r.present += 1
                case .absent: r.absent += 1
                case .late: r.late += 1
                }
            }
            let onRollsNow = e.student?.isEnrolled(on: today) ?? true
            return (r.total > 0 || onRollsNow) ? r : nil
        }
    }

    var body: some View {
        Section {
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let error {
                ErrorBanner(message: error)
            } else if rows.isEmpty {
                Text("No records in the last \(Self.days) days.").foregroundStyle(.secondary)
            } else {
                ForEach(rows) { row in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(row.entry.name).font(.body.weight(.semibold)).lineLimit(1)
                                if let s = row.entry.student, s.isDiscontinued, !s.isOnRolls {
                                    Pill(text: "Left", color: Brand.leaver)
                                }
                            }
                            Text("\(row.present) present · \(row.absent) absent · \(row.late) late")
                                .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                        }
                        Spacer()
                        if let pct = row.percent {
                            Text("\(pct)%")
                                .font(.headline).monospacedDigit()
                                .foregroundStyle(pct >= 75 ? Brand.present : pct >= 50 ? Brand.late : Brand.absent)
                        } else {
                            // Nothing marked is not the same as 0% attendance.
                            Text("—").font(.headline).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        } header: {
            Text("Last \(Self.days) days")
        } footer: {
            Text("Marked days only. Students who left are counted up to their exit date.")
        }
        .task(id: group) { await load() }
    }

    private func load() async {
        loading = true
        do {
            history = try await AttendanceDay.history(group.module, days: Self.days)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}
#endif
