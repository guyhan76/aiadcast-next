import XCTest

final class LoginScreenTests: XCTestCase {
    func testLoginScreenRendersInWebKit() {
        let app = XCUIApplication()
        app.launchArguments = ["--local-web-test", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()

        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 15))
        for provider in ["Google", "카카오|Kakao"] {
            let label = NSPredicate(format: "label MATCHES[c] %@", ".*(" + provider + ").*")
            let button = web.buttons.matching(label).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 25), "Missing login button: " + provider)
        }
    }
}
