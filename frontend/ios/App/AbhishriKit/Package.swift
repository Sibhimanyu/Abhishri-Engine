// swift-tools-version: 6.1
import PackageDescription

// The native iOS screens. The app target (ios/App/App) embeds this package and keeps
// Capacitor only for the web screens shown inside the app (the "More" tab).
//
//   AbhishriCore  pure rules with no Firebase dependency (enrollment, transaction
//                 classification, permissions, date keys), so they unit-test on the Mac:
//                 `swift test` from this directory
//   AbhishriKit   SwiftUI screens + the Firebase data layer
let package = Package(
    name: "AbhishriKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AbhishriKit", targets: ["AbhishriKit"]),
    ],
    dependencies: [
        // Same packages and ranges the Capacitor Firebase plugin already resolves, so
        // the app still links exactly one copy of each.
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "12.7.0")),
        .package(url: "https://github.com/google/GoogleSignIn-iOS", from: "9.0.0"),
    ],
    targets: [
        .target(name: "AbhishriCore"),
        .target(
            name: "AbhishriKit",
            dependencies: [
                "AbhishriCore",
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk", condition: .when(platforms: [.iOS])),
                .product(name: "FirebaseFirestore", package: "firebase-ios-sdk", condition: .when(platforms: [.iOS])),
                .product(name: "FirebaseDatabase", package: "firebase-ios-sdk", condition: .when(platforms: [.iOS])),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS", condition: .when(platforms: [.iOS])),
            ],
            // The web app's logos (frontend/public), light and dark.
            resources: [.process("Resources")]
        ),
        .testTarget(name: "AbhishriCoreTests", dependencies: ["AbhishriCore"]),
    ],
    // Swift 5 mode: Firestore hands back [String: Any], which Swift 6's strict
    // Sendable checking rejects at every actor hop for no safety gain here.
    swiftLanguageModes: [.v5]
)
