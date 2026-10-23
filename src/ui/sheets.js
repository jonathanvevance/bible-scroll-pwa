import { reduceMotion } from './app-state.js';
import { goToVerse, pauseFeed, stopAdvance } from './feed.js';

// ---------- Sheets ----------

const SHEET_CLOSE_MS = 260;

/** Every sheet opens here, so none opens over a moving feed. `fill` runs after the pause. */
export function openSheet(dialog, fill) {
  pauseFeed();
  fill?.();
  dialog.showModal();
}

/** Slides the sheet away before closing it; resolves once it is gone. */
export function closeSheet(dialog) {
  if (!dialog.open || dialog.classList.contains('closing')) return Promise.resolve();
  if (reduceMotion.matches) { dialog.close(); return Promise.resolve(); }
  dialog.classList.add('closing');
  return new Promise((resolve) => setTimeout(() => {
    dialog.classList.remove('closing');
    dialog.close();
    resolve();
  }, SHEET_CLOSE_MS));
}

/** Cross-fades the feed to another place instead of cutting to it. */
export function fadeToVerse(key) {
  if (reduceMotion.matches || !document.startViewTransition) goToVerse(key);
  else document.startViewTransition(() => goToVerse(key));
}

/** Slides a view in from the side, like moving through a navigation stack. */
export function slideIn(node, from) {
  if (reduceMotion.matches) return;
  node.animate(
    [{ transform: `translateX(${from}px)` }, { transform: 'none' }],
    { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
  );
}

// One scroller at a time: a swipe only moves a sheet body that can scroll. Everywhere else on a
// sheet, and on a body too short to scroll, CSS touch-action stops it, so the page behind never
// pans. CSS rather than a touchmove handler, which would hold every scroll until script ran.
// iOS reads touch-action when the finger lands, so `still` is kept up to date beforehand.
function markStill(body) {
  const canScroll = body.scrollHeight > body.clientHeight + 1 && getComputedStyle(body).overflowY !== 'hidden';
  body.classList.toggle('still', !canScroll);
}
const resized = new ResizeObserver((entries) => { for (const e of entries) markStill(e.target); });

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) closeSheet(dialog);
  });
  dialog.addEventListener('close', stopAdvance);
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      for (const body of dialog.querySelectorAll('.sheet-body')) markStill(body);
    });
  }).observe(dialog, { childList: true, subtree: true });
  for (const body of dialog.querySelectorAll('.sheet-body')) resized.observe(body);
}

// Keep sheets above the keyboard: the layout viewport does not shrink when it opens.
// Only while typing: the share sheet also shrinks the visual viewport, and iOS does not
// always report it growing back, which left sheets sized for the share sheet afterwards.
const typing = () => document.activeElement?.matches('textarea, input[type="search"]');
export function trackKeyboard() {
  const root = document.documentElement;
  if (!typing()) {
    for (const name of ['--keyboard', '--viewport-height', '--viewport-top']) root.style.removeProperty(name);
    root.classList.remove('keyboard-up');
    return;
  }
  const vv = visualViewport;
  const keyboard = Math.max(0, innerHeight - vv.height - vv.offsetTop);
  root.style.setProperty('--keyboard', `${keyboard}px`);
  root.style.setProperty('--viewport-height', `${vv.height}px`);
  root.style.setProperty('--viewport-top', `${vv.offsetTop}px`);
  root.classList.toggle('keyboard-up', keyboard > 80);
}
visualViewport?.addEventListener('resize', trackKeyboard);
visualViewport?.addEventListener('scroll', trackKeyboard);
document.addEventListener('visibilitychange', trackKeyboard);
