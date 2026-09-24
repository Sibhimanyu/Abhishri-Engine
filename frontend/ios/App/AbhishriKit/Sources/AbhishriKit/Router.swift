#if os(iOS)
import SwiftUI

public enum AppTab: Hashable {
    case home, attendance, students, fees, more
}

/// Tab selection, plus "open this web screen": native screens hand anything they don't
/// implement (logging a payment, editing a profile) to the web app in the More tab.
@MainActor
@Observable
public final class AppRouter {
    public var tab: AppTab = .home
    weak var web: WebHost?

    public init() {}

    public func openWeb(_ path: String) {
        web?.open(path: path)
        tab = .more
    }
}
#endif
