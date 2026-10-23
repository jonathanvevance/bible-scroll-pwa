import { packKey, verseName } from '../core/references.js';
import { chapterPageIDs, currentVerse, endGlide, itemFor, scrollToPage, settleSoon, stopAdvance } from './feed.js';
// ---------- Verse rail ----------

export const rail = document.getElementById('rail');
const railTrack = document.getElementById('railTrack');
const railLabel = document.getElementById('railLabel');
const railNumber = document.getElementById('railNumber');
const railEnds = [document.getElementById('railFirst'), document.getElementById('railLast')];
/** An end number closer than this to the current one would overlap it, so it hides. */
const NUMBER_GAP_PX = 14;
const railState = { chapterKey: 0, ids: [], current: -1, scrubbing: false, scrubIndex: -1 };

/** True while a finger is dragging along the rail. */
export function isScrubbing() {
  return railState.scrubbing;
}

export function updateRail() {
  const v = currentVerse();
  rail.hidden = !v;
  if (!v) return;
  const chapterKey = packKey(v.book, v.chapter);
  if (chapterKey !== railState.chapterKey) {
    railState.chapterKey = chapterKey;
    railState.ids = chapterPageIDs(v);
    railTrack.style.gap = railState.ids.length > 80 ? '1px' : '2px';
    railTrack.replaceChildren(...railState.ids.map(() => document.createElement('span')));
    railState.current = -1;
    const last = railState.ids.length - 1;
    for (const [end, i] of [[railEnds[0], 0], [railEnds[1], last]]) {
      end.textContent = String(itemFor(railState.ids[i]).verse.verse);
      end.style.top = top(i);
    }
  }
  const index = railState.ids.indexOf(`v${v.key}`);
  if (index === railState.current) return;
  railTrack.children[railState.current]?.classList.remove('current');
  railTrack.children[index]?.classList.add('current');
  railState.current = index;
  railNumber.textContent = String(v.verse);
  railNumber.style.top = top(index);
  const n = railState.ids.length;
  const spacing = railTrack.clientHeight / n;
  railEnds[0].hidden = index * spacing < NUMBER_GAP_PX;
  railEnds[1].hidden = (n - 1 - index) * spacing < NUMBER_GAP_PX;
}

const top = (index) => `${((index + 0.5) / railState.ids.length) * 100}%`;

function scrubTo(clientY) {
  const box = railTrack.getBoundingClientRect();
  const n = railState.ids.length;
  const index = Math.min(n - 1, Math.max(0, Math.floor(((clientY - box.top) / box.height) * n)));
  if (index === railState.scrubIndex) return;
  railState.scrubIndex = index;
  const id = railState.ids[index];
  scrollToPage(id);
  const v = itemFor(id).verse;
  railLabel.textContent = verseName(v);
  railLabel.style.top = `${box.top + ((index + 0.5) / n) * box.height}px`;
  railLabel.hidden = false;
}

rail.addEventListener('pointerdown', (e) => {
  if (!railState.ids.length) return;
  try { rail.setPointerCapture(e.pointerId); } catch {}
  railState.scrubbing = true;
  railState.scrubIndex = -1;
  stopAdvance();
  endGlide();
  scrubTo(e.clientY);
});
rail.addEventListener('pointermove', (e) => { if (railState.scrubbing) scrubTo(e.clientY); });
for (const type of ['pointerup', 'pointercancel']) {
  rail.addEventListener(type, () => {
    railState.scrubbing = false;
    railLabel.hidden = true;
    settleSoon();
  });
}
