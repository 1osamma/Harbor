import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { classifySwipeMove, EDGE_ZONE, shouldCommitSwipe } from "../src/lib/ios-gestures.ts";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/chrome/ios-swipe-back.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function harness() {
  const win = new EventTarget();
  win.innerWidth = 393;
  const timers = new Map();
  let timerId = 0;
  win.setTimeout = (fn) => { timers.set(++timerId, fn); return timerId; };
  win.clearTimeout = (id) => timers.delete(id);
  const page = { style: {} };
  let backs = 0;
  let cleanup;
  const modules = {
    react: { useRef: (current) => ({ current }), useEffect: (fn) => { cleanup = fn(); } },
    "@/lib/ios-gestures": { classifySwipeMove, EDGE_ZONE, shouldCommitSwipe },
    "@/lib/ios-shell": { IOS_SETTINGS_ROOT_EVENT: "settings-root" },
    "@/lib/view": { useView: () => ({ view: "home", topKind: "detail", goBack: () => backs++ }) },
    "./floating-back": { useFloatingBackShown: () => true },
  };
  const exports = {};
  new Function("require", "exports", "window", "document", "getComputedStyle", "requestAnimationFrame", compiled)(
    (name) => { assert.ok(modules[name], name); return modules[name]; }, exports, win,
    { getElementById: () => ({}), querySelector: () => page },
    () => ({ left: "0", display: "block" }), (fn) => fn(),
  );
  exports.IosSwipeBack({ disabled: false });
  const touch = (type, x, count = 1) => {
    const event = new Event(type, { cancelable: true });
    event.touches = Array.from({ length: count }, (_, identifier) => ({ clientX: x, clientY: 100, identifier }));
    win.dispatchEvent(event);
    return event;
  };
  const flush = () => {
    for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
  };
  return { touch, flush, cleanup: () => cleanup(), page, backs: () => backs };
}

test("completed edge swipe navigates back and clears its transform", () => {
  const h = harness();
  h.touch("touchstart", 5);
  assert.equal(h.touch("touchmove", 205).defaultPrevented, true);
  h.touch("touchend", 205, 0);
  h.flush();
  assert.equal(h.backs(), 1);
  assert.equal(h.page.style.transform, "");
  h.cleanup();
});

for (const interruption of ["touchcancel", "multitouch", "unmount"]) {
  test(`${interruption} cancels a committed-distance swipe without navigating`, () => {
    const h = harness();
    h.touch("touchstart", 5);
    h.touch("touchmove", 205);
    if (interruption === "unmount") h.cleanup();
    else if (interruption === "multitouch") h.touch("touchstart", 205, 2);
    else h.touch("touchcancel", 205, 0);
    h.touch("touchend", 205, 0);
    h.flush();
    assert.equal(h.backs(), 0);
    assert.equal(h.page.style.transform, "");
    h.cleanup();
  });
}

test("unmount cancels a pending navigation animation", () => {
  const h = harness();
  h.touch("touchstart", 5);
  h.touch("touchmove", 205);
  h.touch("touchend", 205, 0);
  h.cleanup();
  h.flush();
  assert.equal(h.backs(), 0);
  assert.equal(h.page.style.transform, "");
});
