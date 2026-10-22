import { el } from './dom.js';

/**
 * Haptics. Android has the Vibration API. iOS Safari has none, and since iOS 26.5 script can
 * no longer trigger one; the only path left is the user directly tapping a native switch,
 * which plays the system tick. So tappable elements carry an invisible
 * `<input type="checkbox" switch class="haptic">` over their whole area: one tick per tap,
 * and the click still bubbles to the element's own handler.
 */
export function tick() {
  navigator.vibrate?.(8);
}
/** Gives a button made in script the haptic switch the HTML ones carry. */
export function withHaptic(button) {
  button.append(el('input', { type: 'checkbox', className: 'haptic', tabIndex: -1 }));
  const input = button.lastChild;
  input.setAttribute('switch', '');
  input.setAttribute('aria-hidden', 'true');
  return button;
}
// The rail ticks from scrubTo on every verse it passes, so its switch need not add another.
document.addEventListener('click', (e) => {
  if (e.target.matches?.('input.haptic') && !e.target.closest('#rail')) tick();
}, true);


/** How far a finger may move before a press counts as a drag. */
export const DRAG_PX = 10;
