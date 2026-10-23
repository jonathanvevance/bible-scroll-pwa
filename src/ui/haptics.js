/**
 * Haptics. Android has the Vibration API. iOS Safari has none, and since iOS 26.5 script can
 * no longer trigger one; the only path left is the user directly tapping a native switch.
 * Only the rail carries one (in the HTML); buttons and links tick on Android alone, since a
 * switch inside every control made taps and scrolls feel less native.
 */
export function tick() {
  navigator.vibrate?.(8);
}
document.addEventListener('click', (e) => {
  if (e.target.closest?.('button, a[href]')) tick();
}, true);

/** How far a finger may move before it counts as a swipe rather than a tap. */
export const DRAG_PX = 10;
