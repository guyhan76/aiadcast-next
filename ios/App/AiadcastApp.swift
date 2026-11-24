import SwiftUI
import WebKit

@main
struct AiadcastApp: App {
    var body: some Scene {
        WindowGroup { AiadcastWebView() }
    }
}

struct AiadcastWebView: UIViewRepresentable {
    private var startURL: URL {
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--local-web-test") {
            return URL(string: "http://localhost:4173/#login")!
        }
        #endif
        return URL(string: "https://aiadcast-next.onrender.com/")!
    }

    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.allowsBackForwardNavigationGestures = true
        view.load(URLRequest(url: startURL))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}
}
