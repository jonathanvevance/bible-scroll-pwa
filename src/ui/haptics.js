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
 * Every button carries the switch, including buttons built later or whose text is replaced.
 * Links do not: a switch inside a link takes the tap, so the link might not open. The rail's
 * switch is in the HTML because the rail is a div.
 */
function giveSwitch(button) {
  if (button.closest('#rail') || button.querySelector(':scope > input.haptic')) return;
  const input = el('input', { type: 'checkbox', className: 'haptic', tabIndex: -1 });
  input.setAttribute('switch', '');
  input.setAttribute('aria-hidden', 'true');
  input.disabled = button.disabled;
  button.append(input);
}
function giveSwitches(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.matches('button')) giveSwitch(node);
  for (const button of node.querySelectorAll('button')) giveSwitch(button);
}
giveSwitches(document.body);
new MutationObserver((records) => {
  for (const record of records) {
    const button = record.target.closest?.('button');
    if (button) giveSwitch(button);
    for (const node of record.addedNodes) giveSwitches(node);
  }
}).observe(document.body, { childList: true, subtree: true });
// The rail ticks from scrubTo on every verse it passes, so its switch need not add another.
document.addEventListener('click', (e) => {
  if (e.target.matches?.('input.haptic') && !e.target.closest('#rail')) tick();
}, true);


/** How far a finger may move before a press counts as a drag. */
export const DRAG_PX = 10;
