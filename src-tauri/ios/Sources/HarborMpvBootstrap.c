// Hands the Swift libmpv layer to the Rust library before `main` runs.
//
// The Rust crate is linked twice on iOS, as the app's static library and as a
// cdylib nobody loads. A Rust `extern "C"` declaration of these Swift functions
// would be unresolved in the cdylib link, so Rust receives them at runtime as a
// table of function pointers instead. The layout must match `HarborMpvVtable`
// in src-tauri/src/mpv_ios.rs field for field.

#include <stdbool.h>
#include <stdint.h>

typedef struct HarborMpvVtable {
  int32_t (*create)(void);
  int32_t (*set_option)(const char *name, const char *value);
  int32_t (*initialize)(void);
  int32_t (*observe)(const char *name, int32_t format, uint64_t id);
  int32_t (*command)(const char *args_json);
  int32_t (*set_property)(const char *name, const char *value);
  char *(*get_property)(const char *name, int32_t *err);
  void (*destroy)(void);
  void (*set_geometry)(double x, double y, double w, double h);
  void (*set_visible)(bool visible);
  void (*free_string)(char *ptr);
  const char *(*error_string)(int32_t code);
  char *(*version)(void);
  void (*set_presentation)(bool active);
} HarborMpvVtable;

extern int32_t harbor_mpv_swift_create(void);
extern int32_t harbor_mpv_swift_set_option(const char *name, const char *value);
extern int32_t harbor_mpv_swift_initialize(void);
extern int32_t harbor_mpv_swift_observe(const char *name, int32_t format, uint64_t id);
extern int32_t harbor_mpv_swift_command(const char *args_json);
extern int32_t harbor_mpv_swift_set_property(const char *name, const char *value);
extern char *harbor_mpv_swift_get_property(const char *name, int32_t *err);
extern void harbor_mpv_swift_destroy(void);
extern void harbor_mpv_swift_set_geometry(double x, double y, double w, double h);
extern void harbor_mpv_swift_set_visible(bool visible);
extern void harbor_mpv_swift_free_string(char *ptr);
extern const char *harbor_mpv_swift_error_string(int32_t code);
extern char *harbor_mpv_swift_version(void);
extern void harbor_mpv_swift_set_presentation(bool active);

// Defined in the Rust static library (mpv_ios.rs).
extern void harbor_mpv_ios_register(const HarborMpvVtable *vtable);

static const HarborMpvVtable kHarborMpvVtable = {
  .create = harbor_mpv_swift_create,
  .set_option = harbor_mpv_swift_set_option,
  .initialize = harbor_mpv_swift_initialize,
  .observe = harbor_mpv_swift_observe,
  .command = harbor_mpv_swift_command,
  .set_property = harbor_mpv_swift_set_property,
  .get_property = harbor_mpv_swift_get_property,
  .destroy = harbor_mpv_swift_destroy,
  .set_geometry = harbor_mpv_swift_set_geometry,
  .set_visible = harbor_mpv_swift_set_visible,
  .free_string = harbor_mpv_swift_free_string,
  .error_string = harbor_mpv_swift_error_string,
  .version = harbor_mpv_swift_version,
  .set_presentation = harbor_mpv_swift_set_presentation,
};

// Defined in HarborWebViewInsets.swift: lets the page lay out edge to edge.
extern void harbor_ios_install_webview_insets(void);
// Defined in HarborPresentation.swift: fullscreen video presentation hooks.
extern void harbor_ios_install_presentation(void);

__attribute__((constructor)) static void harbor_mpv_bootstrap(void) {
  harbor_mpv_ios_register(&kHarborMpvVtable);
  harbor_ios_install_webview_insets();
  harbor_ios_install_presentation();
}
