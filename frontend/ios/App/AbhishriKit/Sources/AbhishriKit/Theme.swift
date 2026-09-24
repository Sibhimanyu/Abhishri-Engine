#if os(iOS)
import SwiftUI
import AbhishriCore

/// Brand colours from frontend/src/index.css (--color-brand-primary / -secondary).
public enum Brand {
    public static let coral = Color(red: 0xF1 / 255, green: 0x61 / 255, blue: 0x5B / 255)
    public static let teal = Color(red: 0x66 / 255, green: 0xC8 / 255, blue: 0xC8 / 255)
    static let present = Color.green
    static let absent = Color.red
    static let late = Color.orange
    static let leaver = Color.orange
}

extension AttendanceStatus {
    var color: Color {
        switch self {
        case .present: Brand.present
        case .absent: Brand.absent
        case .late: Brand.late
        }
    }
    var symbol: String {
        switch self {
        case .present: "checkmark.circle.fill"
        case .absent: "xmark.circle.fill"
        case .late: "clock.fill"
        }
    }
}

extension Date {
    var shortDay: String { formatted(.dateTime.day().month(.abbreviated).year()) }
}

/// The school's logo: coral on light backgrounds, white in dark mode (as the web does).
struct Logo: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        // UIImage(named:in:) also finds loose PNGs in a package bundle.
        Image(uiImage: UIImage(named: scheme == .dark ? "logo-white" : "logo-coral", in: .module, with: nil) ?? UIImage())
            .resizable()
            .scaledToFit()
            .accessibilityLabel("Abhishri Academy")
    }
}

/// A small capsule label ("Discontinued", "Leaving 31 Oct", "Tuition").
struct Pill: View {
    let text: String
    var color: Color = .secondary

    var body: some View {
        Text(text)
            .font(.caption2.weight(.bold))
            .textCase(.uppercase)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: Capsule())
    }
}

struct Avatar: View {
    let initials: String
    var size: CGFloat = 40

    var body: some View {
        Text(initials.isEmpty ? "?" : initials)
            .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
            .foregroundStyle(Brand.coral)
            .frame(width: size, height: size)
            .background(Brand.coral.opacity(0.12), in: Circle())
    }
}

/// Enrollment tag for a student row: nothing while enrolled, "Leaving <date>" while
/// serving notice, "Discontinued" once gone.
struct EnrollmentPill: View {
    let student: Student

    var body: some View {
        if student.isLeaving, let exit = student.exitDate {
            Pill(text: "Leaving \(exit.formatted(.dateTime.day().month(.abbreviated)))", color: Brand.leaver)
        } else if student.isDiscontinued {
            Pill(text: "Discontinued", color: Brand.leaver)
        }
    }
}

struct StatTile: View {
    let title: String
    let value: String
    var detail: String? = nil
    var symbol: String
    var tint: Color = Brand.coral

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tint)
            Text(value)
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let detail {
                Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// Shown when a listener fails (usually rules or connectivity), instead of an empty list
/// that looks like "no data".
struct ErrorBanner: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.footnote)
            .foregroundStyle(.red)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
}
#endif
