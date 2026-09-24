import XCTest
@testable import AbhishriCore

/// Mirrors the isEnrolledOn cases in frontend/src/utils/enrollment.test.js. If the web
/// rule changes, change both.
final class EnrollmentTests: XCTestCase {
    // IST, like the school, so day boundaries are tested where they matter.
    var cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Kolkata")!
        return c
    }()

    func day(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    func leaver(_ date: String) -> [String: Any] {
        ["enrollmentStatus": "discontinued", "discontinuation": ["effectiveDate": date]]
    }

    func testNoStatusIsActive() {
        XCTAssertFalse(Enrollment.isDiscontinued(["name": "Old Record"]))
        XCTAssertTrue(Enrollment.isEnrolled([:], on: day(2026, 9, 21), calendar: cal))
    }

    func testStaleDiscontinuationOnActiveStudentIsIgnored() {
        let s: [String: Any] = ["enrollmentStatus": "active", "discontinuation": ["effectiveDate": "2026-07-15"]]
        XCTAssertNil(Enrollment.exitDate(s, calendar: cal))
        XCTAssertTrue(Enrollment.isEnrolled(s, on: day(2026, 9, 1), calendar: cal))
    }

    func testExitDayIncludedNothingAfter() {
        let s = leaver("2026-07-15")
        XCTAssertTrue(Enrollment.isEnrolled(s, on: day(2026, 7, 15, 23, 59), calendar: cal))
        XCTAssertFalse(Enrollment.isEnrolled(s, on: day(2026, 7, 16), calendar: cal))
        XCTAssertTrue(Enrollment.isEnrolled(s, on: day(2026, 7, 1), calendar: cal))
    }

    func testNoticePeriodStaysOnRolls() {
        let now = day(2026, 9, 21)
        XCTAssertTrue(Enrollment.isOnRolls(leaver("2026-10-31"), now: now, calendar: cal))
        XCTAssertFalse(Enrollment.isOnRolls(leaver("2026-09-01"), now: now, calendar: cal))
    }

    func testDiscontinuedWithoutDateIsGone() {
        XCTAssertFalse(Enrollment.isOnRolls(["enrollmentStatus": "discontinued"], now: day(2026, 9, 21), calendar: cal))
    }

    func testDaysAwayBeforeReEnrollmentAreExcluded() {
        let s: [String: Any] = ["discontinuationHistory": [["effectiveDate": "2026-07-15", "reEnrolledOn": "2026-09-02"]]]
        XCTAssertTrue(Enrollment.isEnrolled(s, on: day(2026, 7, 15), calendar: cal))
        XCTAssertFalse(Enrollment.isEnrolled(s, on: day(2026, 8, 10), calendar: cal))
        XCTAssertTrue(Enrollment.isEnrolled(s, on: day(2026, 9, 2), calendar: cal))
    }

    func testReturnTimestampReadsInLocalTime() {
        // 00:30 IST on 2 Sept is 1 Sept in UTC; the return day must be the 2nd.
        let back = ISO8601DateFormatter().string(from: day(2026, 9, 2, 0, 30))
        let s: [String: Any] = ["discontinuationHistory": [["effectiveDate": "2026-07-15", "reEnrolledAt": back]]]
        XCTAssertFalse(Enrollment.isEnrolled(s, on: day(2026, 9, 1), calendar: cal))
        XCTAssertTrue(Enrollment.isEnrolled(s, on: day(2026, 9, 2), calendar: cal))
    }

    func testDateValuesAreAccepted() {
        // The data layer converts Firestore Timestamps to Date before this runs.
        let s: [String: Any] = ["enrollmentStatus": "discontinued", "discontinuation": ["effectiveDate": day(2026, 7, 15)]]
        XCTAssertEqual(Enrollment.exitDate(s, calendar: cal), day(2026, 7, 15))
    }
}

final class FeeTxTests: XCTestCase {
    func testClassification() {
        XCTAssertEqual(FeeTx.classify(["type": "incoming", "method": "Cash"]), .incoming)
        // Typed rows ignore method (see feeTx.mjs history).
        XCTAssertEqual(FeeTx.classify(["type": "incoming", "method": "Concession"]), .incoming)
        XCTAssertEqual(FeeTx.classify(["type": "discount"]), .discount)
        XCTAssertEqual(FeeTx.classify(["type": "void", "category": "Discount"]), .discount)
        XCTAssertEqual(FeeTx.classify(["type": "void", "category": "General Fees"]), .void)
        // Untyped legacy rows use the broader match.
        XCTAssertEqual(FeeTx.classify(["method": "Concession"]), .discount)
        XCTAssertEqual(FeeTx.classify(["category": "Fee Concession"]), .discount)
        XCTAssertEqual(FeeTx.classify(["method": "Cash"]), .incoming)
    }
}

final class PermissionsTests: XCTestCase {
    func testAdminCanEverything() {
        XCTAssertTrue(Permissions(isAdmin: true, raw: [:]).can("fees_accounting", "trans_add"))
    }

    func testModuleGrantedAsTrue() {
        // AuthContext/Attendance.jsx accept `attendance: true` as full access.
        let p = Permissions(isAdmin: false, raw: ["attendance": true])
        XCTAssertTrue(p.canMarkAttendance)
        XCTAssertFalse(p.canViewFees)
    }

    func testRoleDefaults() {
        let teacher = Permissions(isAdmin: false, raw: Permissions.defaults(forRole: "teacher"))
        XCTAssertTrue(teacher.canMarkAttendance)
        XCTAssertFalse(teacher.canViewFees)
        let staff = Permissions(isAdmin: false, raw: Permissions.defaults(forRole: "staff"))
        XCTAssertFalse(staff.canMarkAttendance)
        XCTAssertTrue(staff.canViewAttendance)
    }
}

final class DateKeysTests: XCTestCase {
    func testLocalKeyNotUTC() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Kolkata")!
        // 00:30 IST on 1 Sept is still 31 Aug in UTC.
        let d = cal.date(from: DateComponents(year: 2026, month: 9, day: 1, hour: 0, minute: 30))!
        XCTAssertEqual(DateKeys.key(d, calendar: cal), "2026-09-01")
        XCTAssertEqual(DateKeys.date(fromKey: "2026-09-01", calendar: cal), cal.date(from: DateComponents(year: 2026, month: 9, day: 1)))
        XCTAssertNil(DateKeys.date(fromKey: "2026-09-01T10:00:00Z", calendar: cal))
    }

    func testMoneyIndianGrouping() {
        XCTAssertEqual(Money.inr(123456), "₹1,23,456")
    }
}
