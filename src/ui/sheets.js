import { reduceMotion } from './app-state.js';
import { goToVerse, stopAdvance } from './feed.js';

// ---------- Sheets ----------

const SHEET_CLOSE_MS = 260;

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
    [{ opacity: 0, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
  );
}

// iOS only shows :active press states when the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) closeSheet(dialog);
  });
  dialog.addEventListener('close', stopAdvance);
  // One scroller at a time: a swipe only moves the area under the finger if that area can
  // scroll; otherwise it is swallowed, so the page behind never pans or scrolls.
  dialog.addEventListener('touchmove', (e) => {
    for (let node = e.target; node && node !== dialog; node = node.parentElement) {
      if (!node.matches('.sheet-body, textarea')) continue;
      const canScroll = node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY !== 'hidden';
      if (canScroll) return;
    }
    e.preventDefault();
  }, { passive: false });
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
