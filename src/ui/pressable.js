// Presses that behave like iOS buttons. A control looks pressed (the `pressed` class) while the
// finger is on it or near it. Sliding well away lets go: the look clears and lifting there does
// nothing. Sliding back presses it again. A press that turns into a scroll, begins by stopping a
// scroll, or is taken over by iOS (a long press shows the magnifier) is cancelled for good.
// While a press doesn't count, its group has the `dragged` class, the click that follows the
// lift is swallowed, and the haptic switches are disabled, since a native switch would
// otherwise toggle (and tick) on release.
//
// Every button and link on the page is guarded, with nothing to register; the scroll that counts
// is one of anything the control sits in. One touch is followed at a time, across the whole
// page; a second finger cancels it. Screens never track touches themselves.

/** How far past its edges a finger may wander and still press a control, as in UIKit. */
const SLOP_PX = 70;
/** How long after a press that didn't count the controls wait before taking presses again. */
const RESET_MS = 400;
/** A touch this soon after a scroll is stopping it, not pressing. */
const SCROLL_GRACE_MS = 150;
/** A switch turned off and on again mid-press may not toggle on the lift; then the press clicks. */
const CLICK_WAIT_MS = 300;

const areas = [];
/** When each element (or the page) last scrolled. */
const scrolledAt = new Map();
/**
 * The latest touch, or null: { id, control, group, rect, down, near, left, cancelled, clicked }.
 * `near`: the finger is within the slop of the control; `left`: it has been away and back.
 */
let touch = null;

/** The rail is a slider: dragging along it is the point, so it is never guarded. */
const pressable = (target) => (target.closest('#rail') ? null : target.closest('button, a[href]'));

/**
 * Makes everything inside `root` one press: while a press in it doesn't count, `group(target)`
 * has the `dragged` class and its switches are off. Return null from `group` to fall back to
 * the control itself. Only needed where a whole area should react together.
 */
export function guardPresses(root, { group = () => root } = {}) {
  areas.push({ root, group });
}

function groupFor(target, control) {
  const area = areas.find((a) => a.root.contains(target));
  return area?.group(target) ?? control;
}

const scrolling = (target, since) => [...scrolledAt].some(([node, time]) => time > since && node.contains(target));
const counts = () => touch.near && !touch.cancelled;

document.addEventListener('scroll', (e) => {
  const node = e.target === document ? document.documentElement : e.target;
  scrolledAt.set(node, performance.now());
  if (touch?.down && node.contains(touch.control)) cancel();
}, { capture: true, passive: true });

/** A haptic switch is on only when its control is enabled and no press there is off. */
export function syncSwitches(root) {
  for (const input of root.querySelectorAll('input.haptic')) {
    input.disabled = input.parentElement.closest('button:disabled, .dragged') !== null;
  }
}

function show() {
  const { control, group } = touch;
  control.classList.toggle('pressed', touch.down && counts());
  group.classList.toggle('dragged', !counts());
  syncSwitches(group);
}

function cancel() {
  if (!touch || touch.cancelled) return;
  touch.cancelled = true;
  show();
}

function release() {
  if (!touch) return;
  const { control, group } = touch;
  touch = null;
  control.classList.remove('pressed');
  group.classList.remove('dragged');
  syncSwitches(group);
}

const followed = (e) => touch && [...e.changedTouches].some((t) => t.identifier === touch.id);

document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) return cancel();
  release();
  const control = pressable(e.target);
  if (!control) return;
  touch = {
    id: e.changedTouches[0].identifier, control, group: groupFor(e.target, control),
    rect: control.getBoundingClientRect(), down: true, near: true, left: false, cancelled: false, clicked: false,
  };
  if (scrolling(e.target, performance.now() - SCROLL_GRACE_MS)) touch.cancelled = true;
  show();
}, { capture: true, passive: true });

document.addEventListener('touchmove', (e) => {
  if (!touch?.down || touch.cancelled) return;
  const t = [...e.changedTouches].find((c) => c.identifier === touch.id);
  if (!t) return;
  const { left, right, top, bottom } = touch.rect;
  const near = t.clientX > left - SLOP_PX && t.clientX < right + SLOP_PX
    && t.clientY > top - SLOP_PX && t.clientY < bottom + SLOP_PX;
  if (near === touch.near) return;
  touch.near = near;
  if (!near) touch.left = true;
  show();
}, { capture: true, passive: true });

document.addEventListener('touchend', (e) => {
  if (!followed(e)) return;
  const ended = touch;
  ended.down = false;
  show();
  if (!counts()) return void setTimeout(() => { if (touch === ended) release(); }, RESET_MS);
  if (!ended.left) return release();
  setTimeout(() => {
    if (touch !== ended) return;
    release();
    if (!ended.clicked) ended.control.click();
  }, CLICK_WAIT_MS);
}, { capture: true, passive: true });

// After a cancel the finger may stay down long after, unseen by the page, and a switch still
// toggles on its release, so everything stays off until the next touch begins.
document.addEventListener('touchcancel', (e) => { if (followed(e)) cancel(); }, { capture: true, passive: true });

document.addEventListener('click', (e) => {
  if (!touch || !(touch.group.contains(e.target) || touch.control.contains(e.target))) return;
  if (counts()) {
    touch.clicked = true;
    return;
  }
  e.preventDefault();
  e.stopPropagation();
}, true);
