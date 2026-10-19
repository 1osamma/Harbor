// iOS playback. Desktop drives libmpv through `mpv.rs` and the `libmpv2` crate;
// iOS cannot, because the Rust library is also linked as a cdylib on every
// target and there is no libmpv for that link to resolve against. libmpv on iOS
// comes from MPVKit, which the Xcode project links into the app binary, and a
// thin Swift layer (`src-tauri/ios/Sources/HarborMpv*.swift`) owns the handle
// and the Metal surface. That layer hands Rust a table of C function pointers at
// process start, so this file has no unresolved symbols in either link.
//
// The commands keep the desktop names and argument shapes. `src/lib/player/mpv.ts`
// therefore runs unchanged against this module: same property names, same
// `mpv://event` payloads, same option policy, which is copied here from
// `mpv::mpv_start` rather than shared because that function is interleaved with
// window handles that do not exist on iOS.

use std::collections::HashMap;
use std::ffi::{c_char, CStr, CString};
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

/// Mirrors `HarborMpvVtable` in `src-tauri/ios/Sources/HarborMpvBootstrap.c`.
/// Every int-returning entry follows libmpv: 0 or positive is success, negative
/// is an `mpv_error` code.
#[repr(C)]
pub struct HarborMpvVtable {
    /// Create the handle and the Metal surface below the webview. Pre-init only.
    create: extern "C" fn() -> i32,
    set_option: extern "C" fn(name: *const c_char, value: *const c_char) -> i32,
    initialize: extern "C" fn() -> i32,
    /// format: 1 string, 3 flag, 4 int64, 5 double, 6 node (libmpv's numbering).
    observe: extern "C" fn(name: *const c_char, format: i32, id: u64) -> i32,
    /// `args` is a JSON array of strings.
    command: extern "C" fn(args: *const c_char) -> i32,
    set_property: extern "C" fn(name: *const c_char, value: *const c_char) -> i32,
    /// Returns a malloc'd JSON document (the property as an mpv node) or null.
    /// On null, `err` receives the mpv error code.
    get_property: extern "C" fn(name: *const c_char, err: *mut i32) -> *mut c_char,
    destroy: extern "C" fn(),
    /// Rectangle in CSS pixels, which WKWebView maps 1:1 to UIKit points.
    set_geometry: extern "C" fn(x: f64, y: f64, w: f64, h: f64),
    set_visible: extern "C" fn(visible: bool),
    free_string: extern "C" fn(ptr: *mut c_char),
    error_string: extern "C" fn(code: i32) -> *const c_char,
    /// Returns a malloc'd version string, or null when libmpv is unusable.
    version: extern "C" fn() -> *mut c_char,
}

static VTABLE: AtomicPtr<HarborMpvVtable> = AtomicPtr::new(std::ptr::null_mut());
static APP: OnceLock<AppHandle> = OnceLock::new();
/// Serialises create/stop against each other. Property traffic does not take it:
/// libmpv's client API is thread safe, and the Swift layer keeps the handle valid
/// until `destroy` returns.
static LIFECYCLE: Mutex<SessionState> = Mutex::new(SessionState { started: false, is_live: false });

struct SessionState {
    started: bool,
    is_live: bool,
}

/// Called from the Swift bootstrap before `main`.
#[no_mangle]
pub extern "C" fn harbor_mpv_ios_register(vtable: *const HarborMpvVtable) {
    VTABLE.store(vtable as *mut HarborMpvVtable, Ordering::Release);
}

/// Called by the Swift event loop with one `mpv://event` payload as JSON.
#[no_mangle]
pub extern "C" fn harbor_mpv_ios_emit(json: *const c_char) {
    if json.is_null() {
        return;
    }
    let Some(app) = APP.get() else { return };
    let text = unsafe { CStr::from_ptr(json) }.to_string_lossy();
    let Ok(mut value) = serde_json::from_str::<Value>(&text) else { return };
    // mpv log lines carry stream URLs, which may embed debrid tokens.
    if value.get("event").and_then(Value::as_str) == Some("log") {
        for key in ["prefix", "text"] {
            if let Some(s) = value.get(key).and_then(Value::as_str) {
                let scrubbed = crate::log_privacy::scrub(s);
                value[key] = Value::String(scrubbed);
            }
        }
    }
    let _ = app.emit("mpv://event", value);
}

pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

fn vt() -> Result<&'static HarborMpvVtable, String> {
    let ptr = VTABLE.load(Ordering::Acquire);
    if ptr.is_null() {
        return Err("libmpv is not linked into this build".into());
    }
    Ok(unsafe { &*ptr })
}

fn cstr(s: &str) -> Result<CString, String> {
    CString::new(s).map_err(|_| format!("argument contains a NUL byte: {s:?}"))
}

fn mpv_err(vt: &HarborMpvVtable, code: i32) -> String {
    let p = (vt.error_string)(code);
    if p.is_null() {
        return format!("mpv error {code}");
    }
    unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned()
}

fn set_option(vt: &HarborMpvVtable, name: &str, value: &str) {
    let (Ok(n), Ok(v)) = (cstr(name), cstr(value)) else { return };
    let rc = (vt.set_option)(n.as_ptr(), v.as_ptr());
    if rc < 0 {
        eprintln!("[harbor::mpv-ios] option {name} rejected: {}", mpv_err(vt, rc));
    }
}

fn set_property_raw(vt: &HarborMpvVtable, name: &str, value: &str) -> Result<(), String> {
    let n = cstr(name)?;
    let v = cstr(value)?;
    let rc = (vt.set_property)(n.as_ptr(), v.as_ptr());
    if rc < 0 {
        return Err(format!("set {name}: {}", mpv_err(vt, rc)));
    }
    Ok(())
}

fn argv_command(vt: &HarborMpvVtable, argv: &[&str]) -> Result<(), String> {
    let payload = serde_json::to_string(argv).map_err(|e| e.to_string())?;
    let p = cstr(&payload)?;
    let rc = (vt.command)(p.as_ptr());
    if rc < 0 {
        return Err(format!("{}: {}", argv.first().copied().unwrap_or(""), mpv_err(vt, rc)));
    }
    Ok(())
}

fn get_node(vt: &HarborMpvVtable, name: &str) -> Result<Value, String> {
    let n = cstr(name)?;
    let mut err: i32 = 0;
    let p = (vt.get_property)(n.as_ptr(), &mut err);
    if p.is_null() {
        return Err(format!("get {name}: {}", mpv_err(vt, err)));
    }
    let text = unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned();
    (vt.free_string)(p);
    serde_json::from_str(&text).map_err(|e| format!("get {name}: {e}"))
}

fn require_started() -> Result<bool, String> {
    let g = LIFECYCLE.lock().map_err(|_| "mpv lifecycle poisoned".to_string())?;
    if !g.started {
        return Err("mpv not started".into());
    }
    Ok(g.is_live)
}

// Same names, ids and formats as `mpv::OBSERVED_PROPS`; the frontend keys off
// the names only, so the ids are kept just to make the two lists diffable.
const OBSERVED_PROPS: &[(&str, u64, i32)] = &[
    ("time-pos", 1, 5),
    ("duration", 2, 5),
    ("pause", 3, 3),
    ("eof-reached", 4, 3),
    ("track-list", 5, 6),
    ("volume", 6, 5),
    ("mute", 7, 3),
    ("chapter-list", 8, 6),
    ("sub-delay", 9, 5),
    ("audio-delay", 10, 5),
    ("sub-text", 11, 1),
    ("sub-start", 12, 5),
    ("af", 13, 1),
    ("dwidth", 14, 4),
    ("dheight", 15, 4),
    ("video-params/gamma", 16, 1),
    ("demuxer-cache-duration", 17, 5),
    ("paused-for-cache", 18, 3),
    ("secondary-sub-text", 19, 1),
    ("path", 20, 1),
    ("audio-device-list", 21, 6),
    ("width", 22, 4),
    ("height", 23, 4),
];

// Same allow and block lists as desktop. The webview is the only caller, and it
// renders addon-supplied strings, so it must not be able to reach scripting or
// file-writing commands through this bridge.
const MPV_ALLOWED_COMMANDS: &[&str] = &[
    "af",
    "vf",
    "seek",
    "stop",
    "frame-step",
    "frame-back-step",
    "loadfile",
    "ao-reload",
];

fn mpv_property_blocked(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    let n = n
        .strip_prefix("options/")
        .or_else(|| n.strip_prefix("file-local-options/"))
        .unwrap_or(&n);
    const BLOCKED: &[&str] = &[
        "script",
        "input-",
        "load-scripts",
        "ytdl-raw",
        "screenshot-directory",
        "screenshot-template",
        "sub-add",
        "log-file",
        "terminal",
    ];
    BLOCKED.iter().any(|b| n.starts_with(b))
}

fn value_to_arg(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Bool(b) => if *b { "yes" } else { "no" }.into(),
        Value::Number(n) => n.to_string(),
        Value::Null => String::new(),
        _ => v.to_string(),
    }
}

// Same as `mpv::is_local_network_url`: the torrent engine, the stream proxy and
// LAN home servers can stall for a long time while data arrives.
fn is_local_network_url(url: &str) -> bool {
    let rest = match url.split_once("://") {
        Some((_, r)) => r,
        None => return false,
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = match authority.rsplit_once(':') {
        Some((h, p)) if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) => h,
        _ => authority,
    };
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if host.eq_ignore_ascii_case("localhost") || host == "::1" {
        return true;
    }
    if host.starts_with("127.") || host.starts_with("10.") || host.starts_with("192.168.") {
        return true;
    }
    match host.strip_prefix("172.").and_then(|r| r.split_once('.')) {
        Some((second, _)) => matches!(second.parse::<u8>(), Ok(n) if (16..=31).contains(&n)),
        None => false,
    }
}

fn network_timeout_for(url: &str) -> &'static str {
    if is_local_network_url(url) {
        "600"
    } else {
        "60"
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MpvProbe {
    pub available: bool,
    pub binary: Option<String>,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MpvSub {
    pub url: String,
    pub lang: Option<String>,
}

/// The desktop argument struct, minus nothing: fields that have no meaning on
/// iOS (RTX, D3D11, separate displays) are accepted and ignored so the shared
/// frontend can keep sending them.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct MpvStartArgs {
    pub url: String,
    pub start_at_sec: Option<f64>,
    pub subtitles: Option<Vec<MpvSub>>,
    pub anime4k: Option<bool>,
    pub hdr_to_sdr: Option<bool>,
    pub rtx_hdr: Option<bool>,
    pub rtx_vsr: Option<bool>,
    pub embed: Option<bool>,
    pub anime4k_shaders: Option<Vec<String>>,
    pub d3d11_flip: Option<bool>,
    pub mac_edr: Option<bool>,
    pub is_live: Option<bool>,
    pub full_download: Option<bool>,
    pub cache_dir: Option<String>,
    pub startup_profile: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub extra_options: Option<String>,
    pub renderer: Option<String>,
    pub force_yuv420p: Option<bool>,
    pub separate_display: Option<Value>,
    pub separate_cover_taskbar: Option<bool>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct MpvGeometry {
    pub css_left: f64,
    pub css_top: f64,
    pub css_width: f64,
    pub css_height: f64,
    pub css_view_w: f64,
    pub css_view_h: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioDevice {
    pub name: String,
    pub description: String,
}

#[tauri::command]
pub async fn mpv_probe() -> MpvProbe {
    match vt() {
        Ok(vt) => {
            let p = (vt.version)();
            if p.is_null() {
                return MpvProbe {
                    available: false,
                    binary: None,
                    version: None,
                    error: Some("libmpv init failed".into()),
                };
            }
            let version = unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned();
            (vt.free_string)(p);
            MpvProbe {
                available: true,
                binary: Some("embedded libmpv (MPVKit)".into()),
                version: Some(version),
                error: None,
            }
        }
        Err(e) => MpvProbe {
            available: false,
            binary: None,
            version: None,
            error: Some(e),
        },
    }
}

/// Apply `key=value` lines from the advanced mpv options setting, with the same
/// block list the property bridge uses.
fn apply_extra_options(vt: &HarborMpvVtable, extra: &str) {
    for line in extra.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.trim_start_matches("--");
        let (k, v) = match line.split_once('=') {
            Some((k, v)) => (k.trim(), v.trim()),
            None => (line, "yes"),
        };
        if k.is_empty() || mpv_property_blocked(k) {
            continue;
        }
        set_option(vt, k, v);
    }
}

fn fonts_dir(app: &AppHandle) -> Option<String> {
    crate::fonts::sub_fonts_dir(app).and_then(|p| p.to_str().map(str::to_string))
}

#[tauri::command]
pub async fn mpv_start(app: AppHandle, args: MpvStartArgs) -> Result<(), String> {
    let vt = vt()?;
    let mut g = LIFECYCLE.lock().map_err(|_| "mpv lifecycle poisoned".to_string())?;
    if g.started {
        (vt.destroy)();
        g.started = false;
    }

    let rc = (vt.create)();
    if rc < 0 {
        return Err(format!("libmpv create failed: {}", mpv_err(vt, rc)));
    }

    // Rendering. gpu-next on Vulkan through MoltenVK is the path MPVKit ships
    // and tests on iOS; the Metal layer itself is handed over by `create`.
    set_option(vt, "vo", "gpu-next");
    set_option(vt, "gpu-api", "vulkan");
    set_option(vt, "gpu-context", "moltenvk");
    set_option(vt, "hwdec", "videotoolbox");
    set_option(vt, "video-rotate", "no");
    set_option(vt, "keep-open", "yes");
    set_option(vt, "idle", "yes");
    set_option(vt, "input-default-bindings", "no");
    set_option(vt, "input-vo-keyboard", "no");
    set_option(vt, "osc", "no");
    set_option(vt, "load-scripts", "no");
    set_option(vt, "ytdl", "no");
    if args.force_yuv420p == Some(true) {
        set_option(vt, "vf-append", "format=yuv420p");
    }
    // HDR. With tone mapping off, ask the layer for EDR output; the Swift layer
    // turns `wantsExtendedDynamicRangeContent` on when the display has headroom.
    let hdr_to_sdr = args.hdr_to_sdr.unwrap_or(true);
    set_option(vt, "target-colorspace-hint", if hdr_to_sdr { "no" } else { "yes" });
    if hdr_to_sdr {
        set_option(vt, "tone-mapping", "auto");
    }

    if let Some(dir) = args.cache_dir.as_deref().filter(|d| !d.trim().is_empty()) {
        set_option(vt, "demuxer-cache-dir", dir);
    }

    if let Some(headers) = &args.headers {
        let mut fields = Vec::new();
        for (k, v) in headers {
            if k.eq_ignore_ascii_case("user-agent") {
                set_option(vt, "user-agent", v);
            } else if k.eq_ignore_ascii_case("referer") {
                set_option(vt, "referrer", v);
            } else {
                // mpv parses this as a comma separated list.
                fields.push(format!("{}: {}", k, v.replace(',', "\\,")));
            }
        }
        if !fields.is_empty() {
            set_option(vt, "http-header-fields", &fields.join(","));
        }
    }

    // Cache policy, identical to desktop.
    let is_live = args.is_live.unwrap_or(false);
    if is_live {
        for (k, v) in [
            ("cache", "yes"),
            ("cache-secs", "30"),
            ("cache-pause", "yes"),
            ("cache-pause-initial", "no"),
            ("demuxer-max-bytes", "64MiB"),
            ("demuxer-max-back-bytes", "16MiB"),
            ("demuxer-readahead-secs", "20"),
            ("network-timeout", "60"),
            ("stream-lavf-o", "reconnect=1,reconnect_delay_max=5,reconnect_on_network_error=1"),
            ("demuxer-lavf-o", "http_seekable=0,http_persistent=0"),
            ("stream-buffer-size", "16MiB"),
        ] {
            set_option(vt, k, v);
        }
    } else {
        // Phones have a fraction of a desktop's RAM, and iOS kills a foreground
        // app that grows past its jetsam limit without warning. Keep the forward
        // buffer at the desktop "standard" size even for the high-bitrate
        // profile, and let the disk cache absorb the rest.
        let full_dl = args.full_download.unwrap_or(false);
        let high_bitrate = args.startup_profile.as_deref() == Some("high-bitrate");
        set_option(vt, "cache", "yes");
        set_option(vt, "cache-secs", if full_dl { "100000" } else if high_bitrate { "45" } else { "30" });
        set_option(vt, "cache-pause", "yes");
        set_option(vt, "cache-pause-initial", "no");
        set_option(vt, "cache-pause-wait", if full_dl { "10" } else if high_bitrate { "2" } else { "1" });
        set_option(vt, "demuxer-max-bytes", "128MiB");
        set_option(vt, "demuxer-max-back-bytes", "32MiB");
        set_option(vt, "demuxer-readahead-secs", if full_dl { "100000" } else if high_bitrate { "45" } else { "30" });
        set_option(vt, "cache-on-disk", "yes");
        set_option(vt, "network-timeout", network_timeout_for(&args.url));
        set_option(
            vt,
            "stream-lavf-o",
            "reconnect=1,reconnect_on_network_error=1,reconnect_on_http_error=429,reconnect_delay_max=10,reconnect_delay_total_max=60",
        );
        set_option(vt, "stream-buffer-size", "16MiB");
    }

    // Subtitles: same as desktop. Keep both slots empty until Harbor applies the
    // user's language choice; in embed mode Harbor draws them in the webview.
    set_option(vt, "sub-auto", "all");
    set_option(vt, "sid", "no");
    set_option(vt, "secondary-sid", "no");
    if args.embed.unwrap_or(true) {
        set_option(vt, "sub-visibility", "no");
        set_option(vt, "secondary-sub-visibility", "no");
    }
    if let Some(dir) = fonts_dir(&app) {
        set_option(vt, "sub-fonts-dir", &dir);
    }
    set_option(vt, "sub-font-provider", "auto");
    set_option(vt, "sub-font", "sans-serif");
    // complex shaping is what makes Arabic and other RTL scripts join correctly.
    set_option(vt, "sub-ass-shaper", "complex");
    set_option(vt, "embeddedfonts", "yes");

    if let Some(extra) = args.extra_options.as_deref() {
        apply_extra_options(vt, extra);
    }

    if is_live {
        for (k, v) in [
            ("scale", "bilinear"),
            ("dscale", "bilinear"),
            ("cscale", "bilinear"),
            ("dither", "no"),
            ("deband", "no"),
            ("interpolation", "no"),
        ] {
            set_option(vt, k, v);
        }
    }

    if let Some(start) = args.start_at_sec.filter(|s| s.is_finite() && *s > 0.0) {
        set_option(vt, "start", &format!("{start}"));
    }

    let rc = (vt.initialize)();
    if rc < 0 {
        (vt.destroy)();
        return Err(format!("libmpv initialize failed: {}", mpv_err(vt, rc)));
    }

    for (name, id, format) in OBSERVED_PROPS {
        if let Ok(n) = cstr(name) {
            let rc = (vt.observe)(n.as_ptr(), *format, *id);
            if rc < 0 {
                eprintln!("[harbor::mpv-ios] observe {name} failed: {}", mpv_err(vt, rc));
            }
        }
    }

    if let Err(e) = argv_command(vt, &["loadfile", &args.url, "replace"]) {
        (vt.destroy)();
        return Err(format!("loadfile: {e}"));
    }
    if let Some(subs) = &args.subtitles {
        for sub in subs {
            let _ = argv_command(vt, &["sub-add", &sub.url, "auto"]);
        }
    }
    g.started = true;
    g.is_live = is_live;
    (vt.set_visible)(true);
    Ok(())
}

#[tauri::command]
pub async fn mpv_command(cmd: Vec<Value>) -> Result<(), String> {
    let vt = vt()?;
    let is_live = require_started()?;
    let head = cmd
        .first()
        .and_then(Value::as_str)
        .ok_or_else(|| "first arg must be string".to_string())?;
    if !MPV_ALLOWED_COMMANDS.contains(&head) {
        return Err(format!("mpv command not allowed: {head}"));
    }
    let tail: Vec<String> = cmd[1..].iter().map(value_to_arg).collect();
    if head == "loadfile" && !is_live {
        if let Some(url) = tail.first() {
            let _ = set_property_raw(vt, "network-timeout", network_timeout_for(url));
        }
    }
    let mut argv: Vec<&str> = Vec::with_capacity(tail.len() + 1);
    argv.push(head);
    argv.extend(tail.iter().map(String::as_str));
    argv_command(vt, &argv)
}

#[tauri::command]
pub async fn mpv_set_property(name: String, value: Value) -> Result<(), String> {
    let vt = vt()?;
    require_started()?;
    if mpv_property_blocked(&name) {
        return Err(format!("mpv property not allowed: {name}"));
    }
    set_property_raw(vt, &name, &value_to_arg(&value))
}

#[tauri::command]
pub async fn mpv_get_property(name: String) -> Result<Value, String> {
    let vt = vt()?;
    require_started()?;
    // Desktop reads the property as a string and re-parses numbers. Reading the
    // node and flattening it the same way keeps the reply shape identical.
    let node = get_node(vt, &name)?;
    Ok(match node {
        Value::Number(n) => Value::Number(n),
        Value::Bool(b) => Value::String(if b { "yes" } else { "no" }.into()),
        Value::String(s) => match s.parse::<f64>() {
            Ok(n) if n.is_finite() => json!(n),
            _ => Value::String(s),
        },
        Value::Null => Value::String(String::new()),
        other => Value::String(other.to_string()),
    })
}

#[tauri::command]
pub async fn mpv_vo_passes() -> Result<Vec<String>, String> {
    let vt = vt()?;
    require_started()?;
    let node = get_node(vt, "vo-passes")?;
    let mut out = Vec::new();
    for key in ["fresh", "redraw"] {
        if let Some(items) = node.get(key).and_then(Value::as_array) {
            for item in items {
                if let Some(desc) = item.get("desc").and_then(Value::as_str) {
                    if !out.iter().any(|d: &String| d == desc) {
                        out.push(desc.to_string());
                    }
                }
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn mpv_audio_devices() -> Result<Vec<AudioDevice>, String> {
    let vt = vt()?;
    if require_started().is_err() {
        return Ok(Vec::new());
    }
    let node = get_node(vt, "audio-device-list")?;
    Ok(node
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let name = item.get("name")?.as_str()?.to_string();
                    if name.is_empty() || name == "auto" {
                        return None;
                    }
                    let description = item
                        .get("description")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    Some(AudioDevice { name, description })
                })
                .collect()
        })
        .unwrap_or_default())
}

#[tauri::command]
pub async fn mpv_sub_add(
    url: String,
    lang: Option<String>,
    title: Option<String>,
    select: Option<bool>,
) -> Result<(), String> {
    let vt = vt()?;
    require_started()?;
    let flag = if select.unwrap_or(true) { "select" } else { "auto" };
    let lang = lang.filter(|s| !s.is_empty()).unwrap_or_default();
    let title = title
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| if lang.is_empty() { "Subtitle".into() } else { lang.clone() });
    let url = url.replace('\\', "/");
    let mut argv = vec!["sub-add", url.as_str(), flag, title.as_str()];
    if !lang.is_empty() {
        argv.push(lang.as_str());
    }
    argv_command(vt, &argv).map_err(|e| format!("sub-add failed: {e}"))
}

#[tauri::command]
pub async fn mpv_sub_remove(id: String) -> Result<(), String> {
    let vt = vt()?;
    require_started()?;
    let id = id.trim();
    if id.is_empty() {
        return Err("sub-remove requires a track id".to_string());
    }
    argv_command(vt, &["sub-remove", id])
}

#[tauri::command]
pub async fn mpv_set_geometry(geom: MpvGeometry) -> Result<(), String> {
    let vt = vt()?;
    if [geom.css_left, geom.css_top, geom.css_width, geom.css_height]
        .iter()
        .any(|v| !v.is_finite())
    {
        return Ok(());
    }
    (vt.set_geometry)(geom.css_left, geom.css_top, geom.css_width, geom.css_height);
    Ok(())
}

#[tauri::command]
pub async fn mpv_stop() -> Result<(), String> {
    let vt = vt()?;
    let mut g = LIFECYCLE.lock().map_err(|_| "mpv lifecycle poisoned".to_string())?;
    if g.started {
        (vt.set_visible)(false);
        (vt.destroy)();
        g.started = false;
    }
    Ok(())
}

// Desktop uses these two to park a retained Windows session. iOS never retains
// one, so they answer "nothing was done", which is what macOS answers too.
#[tauri::command]
pub async fn mpv_release_media() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub async fn mpv_restore_media_surface() -> Result<bool, String> {
    if let Ok(vt) = vt() {
        if require_started().is_ok() {
            (vt.set_visible)(true);
        }
    }
    Ok(false)
}

#[tauri::command]
pub async fn mpv_force_below() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn mpv_on_pip_changed(entering: bool) -> Result<(), String> {
    // The argument name is part of the IPC contract (`{ entering }`).
    let _ = entering;
    Ok(())
}

/// mpv writes the frame with `screenshot-to-file`, which is a command the
/// webview cannot reach directly (it is not in the allow list), so the path is
/// confined to the app's cache directory here.
#[tauri::command]
pub async fn mpv_save_screenshot(app: AppHandle, path: String) -> Result<String, String> {
    use tauri::Manager;
    let vt = vt()?;
    require_started()?;
    let base = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("screenshots");
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .unwrap_or("harbor-screenshot.png")
        .to_string();
    let out = base.join(name);
    let out_s = out.to_string_lossy().into_owned();
    argv_command(vt, &["screenshot-to-file", &out_s, "video"])?;
    Ok(out_s)
}

#[tauri::command]
pub async fn mpv_screenshot_data_url(app: AppHandle) -> Result<String, String> {
    use base64::Engine;
    let path = mpv_save_screenshot(app, format!("harbor-frame-{}.png", uuid::Uuid::new_v4())).await?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&path);
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}
