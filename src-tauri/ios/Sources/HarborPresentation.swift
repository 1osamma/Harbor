import ObjectiveC
import UIKit

/// Fullscreen video presentation for the player: landscape on iPhone, no
/// status bar, an auto-hiding home indicator, and system edge gestures that
/// need a second swipe so a scrub near the edge does not leave the app.
///
/// The root view controller belongs to Tauri (tao), so its UIKit preferences
/// are overridden at runtime on that controller's class. The overrides read
/// `playbackActive`, which the web layer drives through
/// `ios_player_presentation` (mpv_ios.rs) whenever the full player opens or
/// closes. Info.ios.plist turns on view-controller-based status bar appearance
/// so these overrides are what UIKit consults.
enum HarborPresentation {
  private(set) static var playbackActive = false
  private static var restoreOrientation: UIInterfaceOrientation?
  private static var patchedClasses = Set<ObjectIdentifier>()
  private static var installed = false

  // MARK: install

  static func install() {
    if installed { return }
    installed = true
    let center = NotificationCenter.default
    for name in [UIWindow.didBecomeKeyNotification, UIScene.didActivateNotification] {
      center.addObserver(forName: name, object: nil, queue: .main) { _ in
        if let root = rootViewController() { patch(root) }
      }
    }
  }

  private static func activeScene() -> UIWindowScene? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
  }

  private static func rootViewController() -> UIViewController? {
    guard let scene = activeScene() else { return nil }
    let window = scene.windows.first { $0.isKeyWindow } ?? scene.windows.first
    return window?.rootViewController
  }

  /// Adds (or replaces) the four presentation getters on the controller's class.
  private static func patch(_ controller: UIViewController) {
    let cls: AnyClass = type(of: controller)
    let id = ObjectIdentifier(cls)
    if patchedClasses.contains(id) { return }
    patchedClasses.insert(id)

    let statusHidden: @convention(block) (AnyObject) -> Bool = { _ in
      HarborPresentation.playbackActive
    }
    let statusStyle: @convention(block) (AnyObject) -> Int = { _ in
      UIStatusBarStyle.lightContent.rawValue
    }
    let homeHidden: @convention(block) (AnyObject) -> Bool = { _ in
      HarborPresentation.playbackActive
    }
    let deferredEdges: @convention(block) (AnyObject) -> UInt = { _ in
      HarborPresentation.playbackActive ? UIRectEdge.all.rawValue : 0
    }
    override(cls, #selector(getter: UIViewController.prefersStatusBarHidden), statusHidden, "B@:")
    override(cls, #selector(getter: UIViewController.preferredStatusBarStyle), statusStyle, "q@:")
    override(cls, #selector(getter: UIViewController.prefersHomeIndicatorAutoHidden), homeHidden, "B@:")
    override(
      cls, #selector(getter: UIViewController.preferredScreenEdgesDeferringSystemGestures),
      deferredEdges, "Q@:")
    refresh(controller)
  }

  private static func override(_ cls: AnyClass, _ sel: Selector, _ block: Any, _ types: String) {
    let imp = imp_implementationWithBlock(block)
    if !class_addMethod(cls, sel, imp, types), let method = class_getInstanceMethod(cls, sel) {
      method_setImplementation(method, imp)
    }
  }

  private static func refresh(_ controller: UIViewController) {
    controller.setNeedsStatusBarAppearanceUpdate()
    controller.setNeedsUpdateOfHomeIndicatorAutoHidden()
    controller.setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
  }

  // MARK: playback

  static func setPlayback(_ active: Bool) {
    guard active != playbackActive else { return }
    playbackActive = active
    guard let scene = activeScene(), let root = rootViewController() else { return }
    patch(root)
    refresh(root)

    // iPad keeps whatever orientation it is held in; video fits either way and
    // forcing a rotation would fight Split View and Stage Manager.
    guard UIDevice.current.userInterfaceIdiom == .phone else { return }
    let mask: UIInterfaceOrientationMask
    if active {
      restoreOrientation = scene.interfaceOrientation
      if scene.interfaceOrientation.isLandscape { return }
      mask = .landscape
    } else {
      guard let previous = restoreOrientation else { return }
      restoreOrientation = nil
      if previous == scene.interfaceOrientation { return }
      mask = maskFor(previous)
    }
    root.setNeedsUpdateOfSupportedInterfaceOrientations()
    // A one-off request, not a lock: turning the phone afterwards still
    // rotates the player, and the page re-measures the video on resize.
    scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
      NSLog("[harbor] orientation request (%@) declined: %@",
            active ? "landscape" : "restore", error.localizedDescription)
    }
  }

  private static func maskFor(_ orientation: UIInterfaceOrientation) -> UIInterfaceOrientationMask {
    switch orientation {
    case .landscapeLeft: return .landscapeLeft
    case .landscapeRight: return .landscapeRight
    case .portraitUpsideDown: return .portraitUpsideDown
    default: return .portrait
    }
  }
}

/// Registered from the bootstrap constructor before `main`.
@_cdecl("harbor_ios_install_presentation")
public func harbor_ios_install_presentation() {
  HarborPresentation.install()
}

@_cdecl("harbor_mpv_swift_set_presentation")
func harbor_mpv_swift_set_presentation(_ active: Bool) {
  if Thread.isMainThread {
    HarborPresentation.setPlayback(active)
  } else {
    DispatchQueue.main.async { HarborPresentation.setPlayback(active) }
  }
}
