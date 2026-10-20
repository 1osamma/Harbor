// libmpv on iOS. Rust (`src-tauri/src/mpv_ios.rs`) owns the option policy and
// the Tauri command surface; this file owns the mpv handle, the Metal layer the
// video is drawn into, and the event loop. The two meet through the C function
// table in HarborMpvBootstrap.c, so neither side links against the other's
// symbols by name except `harbor_mpv_ios_emit` below, which lives in the Rust
// static library that this same app binary links.
//
// The video layer sits *below* the WKWebView, and the webview is made
// transparent. Harbor's player chrome is ordinary DOM over a transparent stage
// (`data-mpv-embed`), the same arrangement desktop uses on macOS and Windows.

import AVFoundation
import Foundation
import Libmpv
import UIKit
import WebKit

@_silgen_name("harbor_mpv_ios_emit")
private func rustEmit(_ json: UnsafePointer<CChar>)

/// Works around MoltenVK forcing a 1x1 drawable to complete presentation, which
/// flickers and can leave the layer stuck at 1x1. Same fix MPVKit's demo ships.
/// https://github.com/mpv-player/mpv/pull/13651
final class HarborMetalLayer: CAMetalLayer {
  override var drawableSize: CGSize {
    get { super.drawableSize }
    set {
      if Int(newValue.width) > 1 && Int(newValue.height) > 1 {
        super.drawableSize = newValue
      }
    }
  }

  // EDR only activates when this is set on the main thread.
  override var wantsExtendedDynamicRangeContent: Bool {
    get { super.wantsExtendedDynamicRangeContent }
    set {
      if Thread.isMainThread {
        super.wantsExtendedDynamicRangeContent = newValue
      } else {
        DispatchQueue.main.sync { super.wantsExtendedDynamicRangeContent = newValue }
      }
    }
  }
}

final class HarborVideoView: UIView {
  let metalLayer = HarborMetalLayer()

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    isUserInteractionEnabled = false
    metalLayer.contentsScale = UIScreen.main.nativeScale
    metalLayer.framebufferOnly = true
    metalLayer.backgroundColor = UIColor.black.cgColor
    layer.addSublayer(metalLayer)
  }

  required init?(coder: NSCoder) { fatalError("not used") }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    metalLayer.frame = bounds
    // mpv's MoltenVK context sizes its swapchain from drawableSize, and a
    // CAMetalLayer does not update drawableSize when its frame changes. Left
    // alone, a rotation kept the portrait-sized picture and UIKit stretched it
    // into the landscape layer: a squashed, wide strip. Keep it at the layer's
    // real pixel size so mpv letterboxes against the true shape (keepaspect).
    let scale = metalLayer.contentsScale
    let pixels = CGSize(
      width: (bounds.width * scale).rounded(),
      height: (bounds.height * scale).rounded())
    if metalLayer.drawableSize != pixels { metalLayer.drawableSize = pixels }
    CATransaction.commit()
  }
}

private func onMain<T>(_ body: () -> T) -> T {
  if Thread.isMainThread { return body() }
  return DispatchQueue.main.sync(execute: body)
}

final class HarborMpv {
  static let shared = HarborMpv()

  private let lock = NSLock()
  private var handle: OpaquePointer?
  private let eventQueue = DispatchQueue(label: "app.harbor.mpv.events", qos: .userInitiated)
  private var videoView: HarborVideoView?
  private weak var webView: WKWebView?
  private var hdrPassthrough = false
  private var lastTimePosEmit: TimeInterval = 0
  private var savedVid: String?
  private var observersInstalled = false

  // The lock covers each libmpv call, not just reading the pointer. Otherwise
  // stop can free a handle between a property/lifecycle call's lookup and use.
  // Never dispatch synchronously to the main thread while holding this lock.

  // MARK: view hierarchy

  private static func findWebView(in view: UIView) -> WKWebView? {
    if let web = view as? WKWebView { return web }
    for sub in view.subviews {
      if let found = findWebView(in: sub) { return found }
    }
    return nil
  }

  private func locateWebView() -> WKWebView? {
    if let web = webView { return web }
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    for window in windows {
      if let web = HarborMpv.findWebView(in: window) {
        webView = web
        return web
      }
    }
    return nil
  }

  /// Insert the video view directly below the webview and let the page show
  /// through. Idempotent.
  private func installVideoView() -> HarborVideoView? {
    if let view = videoView, view.superview != nil { return view }
    guard let web = locateWebView(), let host = web.superview else { return nil }
    let view = videoView ?? HarborVideoView(frame: web.frame)
    view.frame = web.frame
    view.isHidden = true
    host.insertSubview(view, belowSubview: web)
    // While the page is transparent, the safe-area margins show the host view.
    host.backgroundColor = .black
    web.isOpaque = false
    web.backgroundColor = .clear
    web.scrollView.backgroundColor = .clear
    videoView = view
    return view
  }

  private func installLifecycleObservers() {
    if observersInstalled { return }
    observersInstalled = true
    let center = NotificationCenter.default
    center.addObserver(
      forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.enterBackground() }
    center.addObserver(
      forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.enterForeground() }
  }

  // A Metal layer that is not on screen cannot present, and MoltenVK leaves the
  // layer black on return if mpv kept rendering into it. Dropping the video
  // track keeps audio playing in the background (UIBackgroundModes: audio) and
  // restores the user's chosen track afterwards.
  private func enterBackground() {
    lock.lock()
    defer { lock.unlock() }
    guard let mpv = handle else { return }
    if let cstr = mpv_get_property_string(mpv, "vid") {
      savedVid = String(cString: cstr)
      mpv_free(cstr)
    }
    mpv_set_property_string(mpv, "vid", "no")
  }

  private func enterForeground() {
    lock.lock()
    defer { lock.unlock() }
    guard let mpv = handle else { return }
    let vid = savedVid ?? "auto"
    savedVid = nil
    mpv_set_property_string(mpv, "vid", vid)
  }

  // MARK: C entry points

  func create() -> Int32 {
    destroy()
    let created: Bool = onMain {
      guard let view = installVideoView() else { return false }
      _ = view
      installLifecycleObservers()
      let session = AVAudioSession.sharedInstance()
      try? session.setCategory(.playback, mode: .moviePlayback, options: [])
      try? session.setActive(true)
      UIApplication.shared.isIdleTimerDisabled = true
      return true
    }
    if !created { return MPV_ERROR_UNINITIALIZED.rawValue }
    guard let mpv = mpv_create() else { return MPV_ERROR_NOMEM.rawValue }
    let layer: HarborMetalLayer = onMain { videoView!.metalLayer }
    var wid = Int64(Int(bitPattern: Unmanaged.passUnretained(layer).toOpaque()))
    let rc = mpv_set_option(mpv, "wid", MPV_FORMAT_INT64, &wid)
    if rc < 0 {
      mpv_terminate_destroy(mpv)
      return rc
    }
    mpv_request_log_messages(mpv, "warn")
    hdrPassthrough = false
    lock.lock()
    handle = mpv
    lock.unlock()
    return 0
  }

  func setOption(_ name: String, _ value: String) -> Int32 {
    lock.lock()
    defer { lock.unlock() }
    guard let mpv = handle else { return MPV_ERROR_UNINITIALIZED.rawValue }
    if name == "target-colorspace-hint" { hdrPassthrough = value == "yes" }
    return mpv_set_option_string(mpv, name, value)
  }

  func initialize() -> Int32 {
    lock.lock()
    defer { lock.unlock() }
    guard let mpv = handle else { return MPV_ERROR_UNINITIALIZED.rawValue }
    let rc = mpv_initialize(mpv)
    if rc < 0 { return rc }
    let ctx = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
    mpv_set_wakeup_callback(mpv, { ctx in
      guard let ctx else { return }
      Unmanaged<HarborMpv>.fromOpaque(ctx).takeUnretainedValue().drainEvents()
    }, ctx)
    return 0
  }

  func observe(_ name: String, _ format: Int32, _ id: UInt64) -> Int32 {
    lock.lock()
    defer { lock.unlock() }
    guard let mpv = handle else { return MPV_ERROR_UNINITIALIZED.rawValue }
    // Numbering is libmpv's, as sent by mpv_ios.rs.
    let fmt: mpv_format
    switch format {
    case 1: fmt = MPV_FORMAT_STRING
    case 3: fmt = MPV_FORMAT_FLAG
    case 4: fmt = MPV_FORMAT_INT64
    case 5: fmt = MPV_FORMAT_DOUBLE
    case 6: fmt = MPV_FORMAT_NODE
    default: return MPV_ERROR_INVALID_PARAMETER.rawValue
    }
    return mpv_observe_property(mpv, id, name, fmt)
  }

  func command(_ json: String) -> Int32 {
    lock.lock()
    defer { lock.unlock() }
    guard let mpv = handle else { return MPV_ERROR_UNINITIALIZED.rawValue }
    guard let data = json.data(using: .utf8),
      let args = (try? JSONSerialization.jsonObject(with: data)) as? [String], !args.isEmpty
    else { return MPV_ERROR_INVALID_PARAMETER.rawValue }
    var cargs: [UnsafePointer<CChar>?] = args.map { UnsafePointer(strdup($0)) }
    cargs.append(nil)
    defer {
      for p in cargs where p != nil { free(UnsafeMutablePointer(mutating: p)) }
    }
    return cargs.withUnsafeMutableBufferPointer { buf in
      mpv_command(mpv, buf.baseAddress)
    }
  }

  func setProperty(_ name: String, _ value: String) -> Int32 {
    lock.lock()
    defer { lock.unlock() }
    guard let mpv = handle else { return MPV_ERROR_UNINITIALIZED.rawValue }
    return mpv_set_property_string(mpv, name, value)
  }

  func getProperty(_ name: String, _ err: UnsafeMutablePointer<Int32>?) -> UnsafeMutablePointer<CChar>? {
    lock.lock()
    defer { lock.unlock() }
    guard let mpv = handle else {
      err?.pointee = MPV_ERROR_UNINITIALIZED.rawValue
      return nil
    }
    var node = mpv_node()
    let rc = mpv_get_property(mpv, name, MPV_FORMAT_NODE, &node)
    if rc < 0 {
      err?.pointee = rc
      return nil
    }
    let value = HarborMpv.nodeToJSON(node)
    mpv_free_node_contents(&node)
    guard let text = HarborMpv.jsonText(value) else {
      err?.pointee = MPV_ERROR_PROPERTY_FORMAT.rawValue
      return nil
    }
    return strdup(text)
  }

  func destroy() {
    lock.lock()
    let mpv = handle
    handle = nil
    lock.unlock()
    guard let mpv else { return }
    mpv_set_wakeup_callback(mpv, nil, nil)
    // terminate_destroy blocks until the VO has released the layer, which must
    // not happen on the main thread while it is also waiting on us.
    eventQueue.sync { mpv_terminate_destroy(mpv) }
    onMain {
      videoView?.isHidden = true
      videoView?.metalLayer.wantsExtendedDynamicRangeContent = false
      UIApplication.shared.isIdleTimerDisabled = false
      savedVid = nil
    }
  }

  func setGeometry(x: Double, y: Double, w: Double, h: Double) {
    onMain {
      guard let view = videoView, let web = locateWebView() else { return }
      // CSS pixels are UIKit points in WKWebView. The page's viewport origin
      // sits at the scroll view's adjusted inset inside the webview.
      let inset = web.scrollView.adjustedContentInset
      let origin = CGPoint(x: web.frame.minX + inset.left + x, y: web.frame.minY + inset.top + y)
      let frame = CGRect(origin: origin, size: CGSize(width: max(w, 1), height: max(h, 1)))
      if view.frame != frame {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        view.frame = frame
        CATransaction.commit()
      }
    }
  }

  func setVisible(_ visible: Bool) {
    onMain {
      if visible { _ = installVideoView() }
      videoView?.isHidden = !visible
    }
  }

  func version() -> UnsafeMutablePointer<CChar>? {
    guard let probe = mpv_create() else { return nil }
    defer { mpv_terminate_destroy(probe) }
    if mpv_initialize(probe) < 0 { return nil }
    guard let cstr = mpv_get_property_string(probe, "mpv-version") else {
      return strdup("libmpv")
    }
    defer { mpv_free(cstr) }
    return strdup(cstr)
  }

  // MARK: events

  private func drainEvents() {
    eventQueue.async { [weak self] in
      guard let self else { return }
      self.lock.lock()
      defer { self.lock.unlock() }
      while let mpv = self.handle {
        guard let event = mpv_wait_event(mpv, 0) else { break }
        let id = event.pointee.event_id
        if id == MPV_EVENT_NONE { break }
        if let payload = self.payload(for: event.pointee) {
          self.emit(payload)
        }
        if id == MPV_EVENT_SHUTDOWN { break }
      }
    }
  }

  private func emit(_ payload: [String: Any]) {
    guard let text = HarborMpv.jsonText(payload) else { return }
    text.withCString { rustEmit($0) }
  }

  private func payload(for event: mpv_event) -> [String: Any]? {
    switch event.event_id {
    case MPV_EVENT_PROPERTY_CHANGE:
      guard let raw = event.data else { return nil }
      let prop = raw.assumingMemoryBound(to: mpv_event_property.self).pointee
      let name = String(cString: prop.name)
      if name == "time-pos" {
        // Same 200 ms throttle desktop applies in its event loop.
        let now = Date().timeIntervalSince1970
        if now - lastTimePosEmit < 0.2 { return nil }
        lastTimePosEmit = now
      }
      let data = HarborMpv.propertyValue(prop)
      if name == "video-params/gamma", let gamma = data as? String {
        applyEdr(gamma: gamma)
      }
      return ["event": "property-change", "name": name, "data": data]
    case MPV_EVENT_END_FILE:
      var reason = "other"
      if let raw = event.data {
        let end = raw.assumingMemoryBound(to: mpv_event_end_file.self).pointee
        switch end.reason {
        case MPV_END_FILE_REASON_EOF: reason = "eof"
        case MPV_END_FILE_REASON_STOP: reason = "stop"
        case MPV_END_FILE_REASON_QUIT: reason = "quit"
        case MPV_END_FILE_REASON_ERROR: reason = "error"
        case MPV_END_FILE_REASON_REDIRECT: reason = "redirect"
        default: reason = "other"
        }
      }
      return ["event": "end-file", "reason": reason]
    case MPV_EVENT_FILE_LOADED:
      return ["event": "file-loaded"]
    case MPV_EVENT_PLAYBACK_RESTART:
      return ["event": "playback-restart"]
    case MPV_EVENT_SEEK:
      return ["event": "seek"]
    case MPV_EVENT_SHUTDOWN:
      return ["event": "shutdown"]
    case MPV_EVENT_LOG_MESSAGE:
      guard let raw = event.data else { return nil }
      let msg = raw.assumingMemoryBound(to: mpv_event_log_message.self).pointee
      let level = msg.level.map { String(cString: $0) } ?? ""
      guard level == "fatal" || level == "error" || level == "warn" else { return nil }
      // Rust scrubs prefix and text before they reach the webview.
      return [
        "event": "log",
        "prefix": msg.prefix.map { String(cString: $0) } ?? "",
        "level": level,
        "text": msg.text.map { String(cString: $0) } ?? "",
      ]
    default:
      return nil
    }
  }

  private func applyEdr(gamma: String) {
    let wants = hdrPassthrough && (gamma == "pq" || gamma == "hlg")
    DispatchQueue.main.async { [weak self] in
      guard let layer = self?.videoView?.metalLayer else { return }
      let headroom = self?.videoView?.window?.screen.potentialEDRHeadroom ?? 1.0
      layer.wantsExtendedDynamicRangeContent = wants && headroom > 1.0
    }
  }

  // MARK: node conversion

  private static func propertyValue(_ prop: mpv_event_property) -> Any {
    guard let data = prop.data else { return NSNull() }
    switch prop.format {
    case MPV_FORMAT_DOUBLE:
      return data.assumingMemoryBound(to: Double.self).pointee
    case MPV_FORMAT_FLAG:
      return data.assumingMemoryBound(to: Int32.self).pointee != 0
    case MPV_FORMAT_INT64:
      return data.assumingMemoryBound(to: Int64.self).pointee
    case MPV_FORMAT_STRING, MPV_FORMAT_OSD_STRING:
      guard let cstr = data.assumingMemoryBound(to: UnsafePointer<CChar>?.self).pointee else {
        return ""
      }
      return String(cString: cstr)
    case MPV_FORMAT_NODE:
      return nodeToJSON(data.assumingMemoryBound(to: mpv_node.self).pointee)
    default:
      return NSNull()
    }
  }

  static func nodeToJSON(_ node: mpv_node) -> Any {
    switch node.format {
    case MPV_FORMAT_STRING, MPV_FORMAT_OSD_STRING:
      return node.u.string.map { String(cString: $0) } ?? ""
    case MPV_FORMAT_FLAG:
      return node.u.flag != 0
    case MPV_FORMAT_INT64:
      return node.u.int64
    case MPV_FORMAT_DOUBLE:
      let d = node.u.double_
      return d.isFinite ? d : NSNull()
    case MPV_FORMAT_NODE_ARRAY:
      guard let list = node.u.list?.pointee else { return [Any]() }
      var out: [Any] = []
      out.reserveCapacity(Int(list.num))
      for i in 0..<Int(list.num) {
        out.append(nodeToJSON(list.values[i]))
      }
      return out
    case MPV_FORMAT_NODE_MAP:
      guard let list = node.u.list?.pointee else { return [String: Any]() }
      var out: [String: Any] = [:]
      for i in 0..<Int(list.num) {
        guard let key = list.keys?[i] else { continue }
        out[String(cString: key)] = nodeToJSON(list.values[i])
      }
      return out
    default:
      return NSNull()
    }
  }

  static func jsonText(_ value: Any) -> String? {
    // JSONSerialization only takes containers at the top level.
    let wrapped: Any = (value is [Any] || value is [String: Any]) ? value : [value]
    guard JSONSerialization.isValidJSONObject(wrapped),
      let data = try? JSONSerialization.data(withJSONObject: wrapped, options: [.fragmentsAllowed]),
      var text = String(data: data, encoding: .utf8)
    else { return nil }
    if !(value is [Any] || value is [String: Any]) {
      text = String(text.dropFirst().dropLast())
    }
    return text
  }
}

// MARK: - C ABI, wired into the vtable by HarborMpvBootstrap.c

private func str(_ p: UnsafePointer<CChar>?) -> String {
  p.map { String(cString: $0) } ?? ""
}

@_cdecl("harbor_mpv_swift_create")
func harbor_mpv_swift_create() -> Int32 { HarborMpv.shared.create() }

@_cdecl("harbor_mpv_swift_set_option")
func harbor_mpv_swift_set_option(_ name: UnsafePointer<CChar>?, _ value: UnsafePointer<CChar>?) -> Int32 {
  HarborMpv.shared.setOption(str(name), str(value))
}

@_cdecl("harbor_mpv_swift_initialize")
func harbor_mpv_swift_initialize() -> Int32 { HarborMpv.shared.initialize() }

@_cdecl("harbor_mpv_swift_observe")
func harbor_mpv_swift_observe(_ name: UnsafePointer<CChar>?, _ format: Int32, _ id: UInt64) -> Int32 {
  HarborMpv.shared.observe(str(name), format, id)
}

@_cdecl("harbor_mpv_swift_command")
func harbor_mpv_swift_command(_ json: UnsafePointer<CChar>?) -> Int32 {
  HarborMpv.shared.command(str(json))
}

@_cdecl("harbor_mpv_swift_set_property")
func harbor_mpv_swift_set_property(_ name: UnsafePointer<CChar>?, _ value: UnsafePointer<CChar>?) -> Int32 {
  HarborMpv.shared.setProperty(str(name), str(value))
}

@_cdecl("harbor_mpv_swift_get_property")
func harbor_mpv_swift_get_property(
  _ name: UnsafePointer<CChar>?, _ err: UnsafeMutablePointer<Int32>?
) -> UnsafeMutablePointer<CChar>? {
  HarborMpv.shared.getProperty(str(name), err)
}

@_cdecl("harbor_mpv_swift_destroy")
func harbor_mpv_swift_destroy() { HarborMpv.shared.destroy() }

@_cdecl("harbor_mpv_swift_set_geometry")
func harbor_mpv_swift_set_geometry(_ x: Double, _ y: Double, _ w: Double, _ h: Double) {
  HarborMpv.shared.setGeometry(x: x, y: y, w: w, h: h)
}

@_cdecl("harbor_mpv_swift_set_visible")
func harbor_mpv_swift_set_visible(_ visible: Bool) { HarborMpv.shared.setVisible(visible) }

@_cdecl("harbor_mpv_swift_free_string")
func harbor_mpv_swift_free_string(_ p: UnsafeMutablePointer<CChar>?) { free(p) }

@_cdecl("harbor_mpv_swift_error_string")
func harbor_mpv_swift_error_string(_ code: Int32) -> UnsafePointer<CChar>? { mpv_error_string(code) }

@_cdecl("harbor_mpv_swift_version")
func harbor_mpv_swift_version() -> UnsafeMutablePointer<CChar>? { HarborMpv.shared.version() }
