import UIKit
import WebKit

/// Lays Harbor's page out over the whole screen.
///
/// UIKit gives the Tauri WKWebView's scroll view automatic safe-area content
/// insets. With `viewport-fit=cover` the page still starts at y = 0, but its
/// layout height shrinks by the top and bottom insets, which left a dead black
/// band under every screen (~93pt on a Dynamic Island iPhone). The page
/// applies `env(safe-area-inset-*)` itself (src/styles/ios.css), so the scroll
/// view must not inset anything.
enum HarborWebViewInsets {
  private static var installed = false
  private static var fixed = Set<ObjectIdentifier>()

  static func install() {
    if installed { return }
    installed = true
    let center = NotificationCenter.default
    for name in [UIWindow.didBecomeKeyNotification, UIScene.didActivateNotification] {
      center.addObserver(forName: name, object: nil, queue: .main) { _ in
        retry(remaining: 40)
      }
    }
  }

  /// The webview can be attached after its window becomes key, so keep looking
  /// briefly instead of relying on a single notification.
  private static func retry(remaining: Int) {
    if applyToAllWebViews() || remaining <= 0 { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
      retry(remaining: remaining - 1)
    }
  }

  @discardableResult
  private static func applyToAllWebViews() -> Bool {
    var found = false
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    for window in windows {
      for web in webViews(in: window) {
        found = true
        let id = ObjectIdentifier(web)
        if fixed.contains(id) { continue }
        fixed.insert(id)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.contentInset = .zero
        web.scrollView.scrollIndicatorInsets = .zero
        web.setNeedsLayout()
      }
    }
    return found
  }

  private static func webViews(in view: UIView) -> [WKWebView] {
    if let web = view as? WKWebView { return [web] }
    return view.subviews.flatMap { webViews(in: $0) }
  }
}

/// Called from the bootstrap constructor (HarborMpvBootstrap.c) before `main`;
/// it only registers observers, the work happens once a window is up.
@_cdecl("harbor_ios_install_webview_insets")
public func harbor_ios_install_webview_insets() {
  HarborWebViewInsets.install()
}
