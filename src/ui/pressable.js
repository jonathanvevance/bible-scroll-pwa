import { DRAG_PX } from './haptics.js';

// Presses that behave like iOS buttons. A press that slides away, is taken over by iOS (a long
// press shows the magnifier), turns into a scroll, or begins by stopping a scroll does nothing:
// the control stops highlighting, the click that follows the lift is swallowed, and the haptic
// switches are disabled, since a native switch would otherwise toggle (and tick) on release.
//
// Every button and link on the page is guarded, with nothing to register; the scroll that counts
// is one of anything the control sits in. One touch is followed at a time, across the whole
// page; a second finger cancels it. Screens never track touches themselves.

/** How long after a slide-off ends the controls wait before taking presses again. */
const RESET_MS = 400;
/** A touch this soon after a scroll is stopping it, not pressing. */
const SCROLL_GRACE_MS = 150;

const areas = [];
/** When each element (or the page) last scrolled. */
const scrolledAt = new Map();
/** { id, x, y, target, group, moved, down } for the latest touch, or null. */
let touch = null;

/** The rail is a slider: dragging along it is the point, so it is never guarded. */
const pressable = (target) => (target.closest('#rail') ? null : target.closest('button, a[href]'));

/**
 * Makes everything inside `root` one press: a slide-off anywhere in it gives `group(target)` the
 * `dragged` class and turns its switches off. Return null from `group` to fall back to the
 * button itself. Only needed where a whole area should react together.
 */
export function guardPresses(root, { group = () => root } = {}) {
  areas.push({ root, group });
}

function groupFor(target) {
  const area = areas.find((a) => a.root.contains(target));
  return area?.group(target) ?? pressable(target);
}

const scrolling = (target, since) => [...scrolledAt].some(([node, time]) => time > since && node.contains(target));

document.addEventListener('scroll', (e) => {
  const node = e.target === document ? document.documentElement : e.target;
  scrolledAt.set(node, performance.now());
  if (touch?.down && node.contains(touch.target)) drag();
}, { capture: true, passive: true });

/** A haptic switch is on only when its control is enabled and no slide-off is in progress. */
export function syncSwitches(root) {
  for (const input of root.querySelectorAll('input.haptic')) {
    input.disabled = input.parentElement.closest('button:disabled, .dragged') !== null;
  }
}

function drag() {
  if (!touch || touch.moved) return;
  touch.moved = true;
  touch.group.classList.add('dragged');
  syncSwitches(touch.group);
}

function release() {
  if (!touch) return;
  const { group } = touch;
  touch = null;
  group.classList.remove('dragged');
  syncSwitches(group);
}

const followed = (e) => touch && [...e.changedTouches].some((t) => t.identifier === touch.id);

document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1) return drag();
  release();
  const group = groupFor(e.target);
  if (!group) return;
  const t = e.changedTouches[0];
  touch = { id: t.identifier, x: t.clientX, y: t.clientY, target: e.target, group, moved: false, down: true };
  if (scrolling(e.target, performance.now() - SCROLL_GRACE_MS)) drag();
}, { capture: true, passive: true });

document.addEventListener('touchmove', (e) => {
  if (!touch || touch.moved) return;
  const t = [...e.changedTouches].find((c) => c.identifier === touch.id);
  if (t && Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > DRAG_PX) drag();
}, { capture: true, passive: true });

document.addEventListener('touchend', (e) => {
  if (!followed(e)) return;
  touch.down = false;
  if (!touch.moved) return;
  const ended = touch;
  setTimeout(() => { if (touch === ended) release(); }, RESET_MS);
}, { capture: true, passive: true });

// After a cancel the finger may stay down long after, unseen by the page, and a switch still
// toggles on its release, so everything stays off until the next touch begins.
document.addEventListener('touchcancel', (e) => { if (followed(e)) drag(); }, { capture: true, passive: true });

document.addEventListener('click', (e) => {
  if (!touch?.moved || !touch.group.contains(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
}, true);
