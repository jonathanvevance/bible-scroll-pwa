// A temporary overlay for finding why some reflection cards won't scroll the sheet on iPhone.
// Loaded only with ?debug in the address. For each touch in the reflections sheet it shows the
// element hit, the touch-action CSS gives it and each parent up to the sheet body, whether the
// body counted as too short to scroll (`still`), what the touch did, and whether the sheet moved.
//
// &x=a,b turns on test switches, each taking one suspect away:
//   norel     rows lose position: relative (their own layer)
//   noselect  card text can't be selected, and no long-press callout
//   nostill   the "too short to scroll" marking never blocks a pan
//   noborder  no hairline between rows (the one style the first row lacks)

const SWITCHES = {
  norel: '.card-list > li.reflection-row { position: static !important; }',
  noselect: '#timelineList, #timelineList * { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }',
  nostill: '.sheet .sheet-body.still { touch-action: pan-y !important; }',
  noborder: '.card-list > li { border-top: 0 !important; }',
};
const on = (new URLSearchParams(location.search).get('x') ?? '').split(',').filter((s) => s in SWITCHES);
document.head.append(Object.assign(document.createElement('style'), { textContent: on.map((s) => SWITCHES[s]).join('\n') }));

const timeline = document.getElementById('timeline');
const body = document.getElementById('timelineBody');
const panel = Object.assign(document.createElement('pre'), { className: 'touch-debug' });
panel.style.cssText = 'position:absolute;z-index:99;left:8px;right:8px;bottom:8px;margin:0;padding:8px;'
  + 'border-radius:10px;background:rgba(0,0,0,.82);color:#7CFC00;font:11px/1.35 ui-monospace,monospace;'
  + 'white-space:pre-wrap;pointer-events:none;max-height:45%;overflow:hidden';
timeline.append(panel);

let openedAt = 0;
const stillLog = [];
const touches = [];
const since = () => `${Math.round(performance.now() - openedAt)}ms`;

new MutationObserver(() => {
  if (timeline.open && !openedAt) openedAt = performance.now();
  if (!timeline.open) { openedAt = 0; stillLog.length = 0; }
}).observe(timeline, { attributes: true, attributeFilter: ['open'] });

new MutationObserver(() => {
  stillLog.push(`${since()} ${body.classList.contains('still') ? 'still ON' : 'still off'}`);
  show();
}).observe(body, { attributes: true, attributeFilter: ['class'] });

const name = (node) => {
  const id = node.id ? `#${node.id}` : '';
  const cls = typeof node.className === 'string' && node.className ? `.${node.className.trim().split(/\s+/).join('.')}` : '';
  return `${node.tagName.toLowerCase()}${id}${cls}`;
};

function show() {
  const row = (t) => [
    `${t.at} hit ${t.hit}${t.card ? ` (card ${t.card})` : ''}`,
    `  touch-action: ${t.chain}`,
    `  still=${t.still} body ${t.size} top ${t.top}→${t.end ?? '…'} moves=${t.moves} drag=${t.dy}px${t.cancelled ? ' CANCELLED' : ''}${t.selected ? ' SELECTED-TEXT' : ''}`,
  ].join('\n');
  panel.textContent = [
    `switches: ${on.join(',') || 'none'}   still: ${stillLog.slice(-3).join(' | ') || '-'}`,
    ...touches.map(row),
  ].join('\n');
}

let current = null;
document.addEventListener('touchstart', (e) => {
  if (!timeline.open || !body.contains(e.target)) return;
  const chain = [];
  for (let node = e.target; node && node !== body.parentElement; node = node.parentElement) {
    chain.push(`${name(node).split('.')[0]}${node === body ? '(body)' : ''}=${getComputedStyle(node).touchAction}`);
  }
  const li = e.target.closest('#timelineList > li');
  current = {
    at: since(),
    hit: name(e.target),
    card: li ? [...li.parentElement.children].indexOf(li) + 1 : 0,
    chain: chain.join(' < '),
    still: body.classList.contains('still'),
    size: `${body.scrollHeight}/${body.clientHeight}`,
    top: Math.round(body.scrollTop),
    y: e.touches[0].clientY,
    moves: 0,
    dy: 0,
  };
  touches.unshift(current);
  touches.length = Math.min(touches.length, 3);
  show();
}, { capture: true, passive: true });

document.addEventListener('touchmove', (e) => {
  if (!current) return;
  current.moves++;
  current.dy = Math.round(e.touches[0].clientY - current.y);
}, { capture: true, passive: true });

const finish = (cancelled) => () => {
  const t = current;
  if (!t) return;
  current = null;
  t.cancelled = cancelled;
  t.selected = !!document.getSelection()?.toString();
  // After the lift, so a fling that did start has moved the sheet.
  setTimeout(() => { t.end = Math.round(body.scrollTop); show(); }, 300);
  show();
};
document.addEventListener('touchend', finish(false), { capture: true, passive: true });
document.addEventListener('touchcancel', finish(true), { capture: true, passive: true });
