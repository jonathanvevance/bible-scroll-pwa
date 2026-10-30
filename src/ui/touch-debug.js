// A temporary overlay for finding why some reflection cards won't scroll the sheet on iPhone.
// Loaded only with ?debug in the address. For each touch in the reflections sheet it shows the
// element hit, the touch-action CSS gives it and each parent up to the sheet body, whether the
// body counted as too short to scroll (`still`), and whether the drag then scrolled.

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
    `  still=${t.still} body ${t.size} top=${t.top} → ${t.scrolled ?? '…'}`,
  ].join('\n');
  panel.textContent = [`still: ${stillLog.slice(-4).join(' | ') || '-'}`, ...touches.map(row)].join('\n');
}

document.addEventListener('touchstart', (e) => {
  if (!timeline.open || !body.contains(e.target)) return;
  const chain = [];
  for (let node = e.target; node && node !== body.parentElement; node = node.parentElement) {
    chain.push(`${name(node).split('.')[0]}${node === body ? '(body)' : ''}=${getComputedStyle(node).touchAction}`);
  }
  const li = e.target.closest('#timelineList > li');
  const t = {
    at: since(),
    hit: name(e.target),
    card: li ? [...li.parentElement.children].indexOf(li) + 1 : 0,
    chain: chain.join(' < '),
    still: body.classList.contains('still'),
    size: `${body.scrollHeight}/${body.clientHeight}`,
    top: Math.round(body.scrollTop),
  };
  touches.unshift(t);
  touches.length = Math.min(touches.length, 3);
  const startTop = body.scrollTop;
  setTimeout(() => { t.scrolled = body.scrollTop !== startTop ? 'SCROLLED' : 'did not scroll'; show(); }, 400);
  show();
}, { capture: true, passive: true });
