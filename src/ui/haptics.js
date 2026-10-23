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
/**
 * Every button and link carries the switch, including ones built later or whose text is
 * replaced. The rail's switch is in the HTML because the rail is a div.
 */
const CONTROLS = 'button, a[href]';
function giveSwitch(control) {
  if (control.closest('#rail') || control.querySelector(':scope > input.haptic')) return;
  const input = el('input', { type: 'checkbox', className: 'haptic', tabIndex: -1 });
  input.setAttribute('switch', '');
  input.setAttribute('aria-hidden', 'true');
  input.disabled = control.disabled === true;
  control.append(input);
}
function giveSwitches(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.matches(CONTROLS)) giveSwitch(node);
  for (const control of node.querySelectorAll(CONTROLS)) giveSwitch(control);
}
giveSwitches(document.body);
new MutationObserver((records) => {
  for (const record of records) {
    const control = record.target.closest?.(CONTROLS);
    if (control) giveSwitch(control);
    for (const node of record.addedNodes) giveSwitches(node);
  }
}).observe(document.body, { childList: true, subtree: true });
// The rail ticks from scrubTo on every verse it passes, so its switch need not add another.
document.addEventListener('click', (e) => {
  if (e.target.matches?.('input.haptic') && !e.target.closest('#rail')) tick();
}, true);
// A tap on a link's switch toggles the switch instead of following the link, so follow it here.
// Not reached when the press guard swallows the click.
document.addEventListener('click', (e) => {
  if (e.target.matches?.('input.haptic') && e.target.parentElement.matches('a[href]')) e.target.parentElement.click();
});


/** How far a finger may move before it counts as a swipe rather than a tap. */
export const DRAG_PX = 10;
