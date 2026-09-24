#if os(iOS)
import SwiftUI
import AbhishriCore

/// The app's root. The app target creates it with its Capacitor-backed WebHost.
public struct RootView: View {
    @State private var session = Session()
    @State private var router = AppRouter()
    @State private var students = StudentsStore()
    @State private var autoSignInTried = false
    private let web: WebHost

    public init(web: WebHost) {
        self.web = web
    }

    /// Debug-only (see DebugLaunch): sign in once the session knows it is signed out.
    private func autoSignInIfRequested() async {
        guard case .signedOut = session.state, let creds = DebugLaunch.autoSignIn, !autoSignInTried else { return }
        autoSignInTried = true
        await session.signIn(email: creds.email, password: creds.password)
    }

    public var body: some View {
        Group {
            switch session.state {
            case .loading:
                ProgressView().controlSize(.large)
            case .signedOut:
                LoginView(session: session)
            case .staff(let profile):
                MainTabView(profile: profile, session: session, router: router, students: students, web: web)
            case .webOnly:
                // Parents, students and not-yet-authorised accounts: the web app already
                // handles all of these (portal / "not authorised").
                WebScreen(web: web).ignoresSafeArea()
            case .failed(let message):
                ContentUnavailableView {
                    Label("Couldn't load your account", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Sign out") { Task { await session.signOut() } }
                }
            }
        }
        .tint(Brand.coral)
        .onAppear {
            session.web = web
            router.web = web
            if let tab = DebugLaunch.initialTab { router.tab = tab }
        }
        .task(id: session.state) { await autoSignInIfRequested() }
        .onChange(of: session.state) { old, state in
            // Student data is only fetched for staff, and dropped on sign-out.
            if case .staff = state { students.start() } else { students.stop() }
            // Back to Home after a real sign-out (not on the first launch, which starts
            // signed out too), so the next person doesn't land on someone else's tab.
            if case .signedOut = state, case .staff = old { router.tab = .home }
        }
    }
}

struct LoginView: View {
    @Bindable var session: Session
    @State private var email = ""
    @State private var password = ""
    @FocusState private var field: Field?
    enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 10) {
                    Logo().frame(height: 72).padding(.bottom, 12)
                    Text("Welcome to Abhishri").font(.title.bold())
                    Text("Sign in to your school workspace").foregroundStyle(.secondary)
                }
                .padding(.top, 48)

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($field, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { field = .password }
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($field, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(signIn)
                }
                .textFieldStyle(LoginFieldStyle())

                if let error = session.errorMessage {
                    ErrorBanner(message: error)
                }

                VStack(spacing: 12) {
                    Button(action: signIn) {
                        Group {
                            if session.busy { ProgressView().tint(.white) } else { Text("Sign In").bold() }
                        }
                        .frame(maxWidth: .infinity, minHeight: 24)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)

                    Button {
                        Task { await session.signInWithGoogle() }
                    } label: {
                        Label("Continue with Google", systemImage: "g.circle.fill")
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .foregroundStyle(.primary)
                            .background(Color(.secondarySystemGroupedBackground), in: Capsule())
                            .overlay(Capsule().strokeBorder(Color(.separator), lineWidth: 0.5))
                    }
                    .buttonStyle(.plain)
                }
                .disabled(session.busy)

                if AbhishriKit.usingEmulator {
                    Pill(text: "Local emulator", color: .purple)
                }
            }
            .padding(24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemGroupedBackground))
    }

    private func signIn() {
        field = nil
        Task { await session.signIn(email: email, password: password) }
    }
}

private struct LoginFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(14)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct MainTabView: View {
    let profile: Profile
    let session: Session
    @Bindable var router: AppRouter
    let students: StudentsStore
    let web: WebHost

    private var perms: Permissions { profile.permissions }

    var body: some View {
        TabView(selection: $router.tab) {
            HomeView(profile: profile, session: session, students: students, router: router)
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(AppTab.home)
            if perms.canViewAttendance {
                AttendanceView(profile: profile, students: students)
                    .tabItem { Label("Attendance", systemImage: "checklist") }
                    .tag(AppTab.attendance)
            }
            if perms.canViewStudents {
                StudentsView(profile: profile, students: students, router: router)
                    .tabItem { Label("Students", systemImage: "person.2.fill") }
                    .tag(AppTab.students)
            }
            if perms.canViewFees {
                FeesView(profile: profile, students: students, router: router)
                    .tabItem { Label("Fees", systemImage: "indianrupeesign.circle.fill") }
                    .tag(AppTab.fees)
            }
            WebScreen(web: web)
                .ignoresSafeArea(edges: .top)
                .tabItem { Label("More", systemImage: "square.grid.2x2.fill") }
                .tag(AppTab.more)
        }
    }
}

/// The long-lived web view controller, hosted in SwiftUI. It is created once and moved
/// between hosts, so the web app keeps its state (and its session) across tab switches.
struct WebScreen: UIViewControllerRepresentable {
    let web: WebHost

    func makeUIViewController(context: Context) -> UIViewController {
        let container = UIViewController()
        attach(web.viewController, to: container)
        return container
    }

    func updateUIViewController(_ container: UIViewController, context: Context) {
        if web.viewController.parent !== container { attach(web.viewController, to: container) }
    }

    private func attach(_ child: UIViewController, to container: UIViewController) {
        child.willMove(toParent: nil)
        child.view.removeFromSuperview()
        child.removeFromParent()
        container.addChild(child)
        child.view.frame = container.view.bounds
        child.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.view.addSubview(child.view)
        child.didMove(toParent: container)
    }
}
#endif
