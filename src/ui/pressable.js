import { DRAG_PX } from './haptics.js';

// Presses that behave like iOS buttons. A press that slides away, is taken over by iOS (a long
// press shows the magnifier), turns into a scroll, or begins by stopping a scroll does nothing:
// the control stops highlighting, the click that follows the lift is swallowed, and the haptic
// switches are disabled, since a native switch would otherwise toggle (and tick) on release.
//
// One touch is followed at a time, across the whole page; a second finger cancels it. Screens
// register the areas that hold their controls with guardPresses() and never track touches
// themselves.

/** How long after a slide-off ends the controls wait before taking presses again. */
const RESET_MS = 400;
/** A touch this soon after a scroll is stopping it, not pressing. */
const SCROLL_GRACE_MS = 150;

const areas = [];
/** { id, x, y, area, group, moved, down } for the latest touch, or null. */
let touch = null;

/**
 * Guards the presses inside `root`. `group(target)` names the element a press belongs to (it
 * gets the `dragged` class and its switches turn off), or null to leave that touch alone.
 * A scroll of any of `scrollers` during or just before a touch counts as a drag.
 */
export function guardPresses(root, { group = () => root, scrollers = [] } = {}) {
  const area = { root, group, lastScroll: 0 };
  areas.push(area);
  for (const scroller of scrollers) {
    scroller.addEventListener('scroll', () => {
      area.lastScroll = performance.now();
      if (touch?.area === area && touch.down) drag();
    }, { passive: true });
  }
}

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
  const area = areas.find((a) => a.root.contains(e.target));
  const group = area?.group(e.target);
  if (!group) return;
  const t = e.changedTouches[0];
  touch = { id: t.identifier, x: t.clientX, y: t.clientY, area, group, moved: false, down: true };
  if (performance.now() - area.lastScroll < SCROLL_GRACE_MS) drag();
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
