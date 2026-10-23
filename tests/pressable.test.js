import { guardPresses } from '../src/ui/pressable.js';
import { test, eq, ok } from './runner.js';

// Synthetic touches on a button, as the app's controls have.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fixture(options, { register = true, id = '' } = {}) {
  const root = document.createElement('div');
  root.id = id;
  root.innerHTML = '<button>Tap</button>';
  document.body.append(root);
  const button = root.querySelector('button');
  let clicks = 0;
  button.addEventListener('click', () => clicks++);
  if (register) guardPresses(root, options?.(root));
  return { root, button, clicks: () => clicks, remove: () => root.remove() };
}

let nextId = 1;
/** A finger on the middle of `target`; `move` is relative to where it went down. */
function finger(target, dx = 0, dy = 0) {
  const id = nextId++;
  const rect = target.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + dx;
  const y = rect.top + rect.height / 2 + dy;
  const fire = (type, cx, cy, rest = []) => {
    const t = new Touch({ identifier: id, target, clientX: cx, clientY: cy });
    const touches = type === 'touchend' || type === 'touchcancel' ? rest : [t, ...rest];
    target.dispatchEvent(new TouchEvent(type, { bubbles: true, touches, changedTouches: [t] }));
  };
  return {
    down: (others = []) => fire('touchstart', x, y, others),
    move: (dx, dy) => fire('touchmove', x + dx, y + dy),
    up: () => fire('touchend', x, y),
    cancel: () => fire('touchcancel', x, y),
    touch: () => new Touch({ identifier: id, target, clientX: x, clientY: y }),
  };
}

const FAR = 200; // well past the 70 px a press may wander
const pressed = (f) => f.button.classList.contains('pressed');

test('pressable: a tap clicks, looking pressed while the finger is down', async () => {
  const f = fixture();
  const p = finger(f.button);
  p.down();
  ok(pressed(f), 'pressed while down');
  p.move(3, 2); p.up();
  ok(!pressed(f), 'not pressed after the lift');
  f.button.click();
  eq(f.clicks(), 1, 'clicks');
  f.remove();
});

test('pressable: a small slide still presses, as in iOS', async () => {
  const f = fixture();
  const p = finger(f.button);
  p.down(); p.move(0, 50);
  ok(pressed(f), 'still pressed');
  p.up(); f.button.click();
  eq(f.clicks(), 1, 'clicks');
  f.remove();
});

test('pressable: sliding well away lets go', async () => {
  const f = fixture();
  const p = finger(f.button);
  p.down(); p.move(0, FAR);
  ok(!pressed(f), 'no longer looks pressed');
  p.up(); f.button.click();
  eq(f.clicks(), 0, 'click swallowed');
  await wait(450);
  f.button.click();
  eq(f.clicks(), 1, 'a later click counts');
  f.remove();
});

test('pressable: sliding away and back presses again and clicks once', async () => {
  const f = fixture();
  const p = finger(f.button);
  p.down(); p.move(0, FAR); p.move(0, 5);
  ok(pressed(f), 'pressed again');
  p.up();
  eq(f.clicks(), 1, 'clicked on the lift');
  f.button.click();
  await wait(350);
  eq(f.clicks(), 1, 'and is not doubled');
  f.remove();
});

test('pressable: a quick re-tap after a slide-off works', async () => {
  const f = fixture();
  const slide = finger(f.button);
  slide.down(); slide.move(FAR, 0); slide.up();
  const tap = finger(f.button);
  tap.down();
  ok(pressed(f), 'pressed at the new touch');
  tap.up(); f.button.click();
  eq(f.clicks(), 1, 'the re-tap clicks');
  f.remove();
});

test('pressable: after iOS cancels a touch, clicks are swallowed until the next touch', async () => {
  const f = fixture();
  const p = finger(f.button);
  p.down(); p.cancel();
  await wait(700);
  f.button.click();
  eq(f.clicks(), 0, 'click swallowed');
  const next = finger(f.button);
  next.down(); next.up(); f.button.click();
  eq(f.clicks(), 1, 'the next tap counts');
  f.remove();
});

test('pressable: a second finger cancels the press', async () => {
  const f = fixture();
  const first = finger(f.button);
  first.down();
  const second = finger(f.button, 5, 5);
  second.down([first.touch()]);
  ok(!pressed(f), 'not pressed');
  first.up(); f.button.click();
  eq(f.clicks(), 0, 'click swallowed');
  f.remove();
});

test('pressable: any button is guarded, without registering', async () => {
  const f = fixture(null, { register: false });
  const p = finger(f.button);
  p.down(); p.move(0, FAR);
  p.up(); f.button.click();
  eq(f.clicks(), 0, 'click swallowed');
  await wait(450);
  f.remove();
});

test('pressable: the rail is a slider and is never guarded', async () => {
  const f = fixture(null, { register: false, id: 'rail' });
  const p = finger(f.button);
  p.down(); p.move(0, FAR);
  p.up(); f.button.click();
  eq(f.clicks(), 1, 'click counts');
  f.remove();
});

test('pressable: a scroll elsewhere does not cancel a press', async () => {
  const f = fixture();
  const other = document.createElement('div');
  document.body.append(other);
  other.dispatchEvent(new Event('scroll'));
  const p = finger(f.button);
  p.down(); other.dispatchEvent(new Event('scroll')); p.up(); f.button.click();
  eq(f.clicks(), 1, 'click counts');
  other.remove();
  f.remove();
});

test('pressable: a touch that stops a scroll, or turns into one, presses nothing', async () => {
  const f = fixture();
  const scroller = f.root;
  scroller.dispatchEvent(new Event('scroll'));
  const stop = finger(f.button);
  stop.down(); stop.up(); f.button.click();
  eq(f.clicks(), 0, 'touch right after a scroll');
  await wait(450);
  const p = finger(f.button);
  p.down(); scroller.dispatchEvent(new Event('scroll')); p.up(); f.button.click();
  eq(f.clicks(), 0, 'scroll during the touch');
  f.remove();
});

test('pressable: in a scroller the pressed look waits, and a quick tap still flashes it', async () => {
  const f = fixture();
  f.root.style.cssText = 'height: 20px; overflow-y: auto';
  f.root.append(Object.assign(document.createElement('div'), { style: 'height: 200px' }));
  const p = finger(f.button);
  p.down();
  ok(!pressed(f), 'not pressed at once');
  await wait(150);
  ok(pressed(f), 'pressed after a moment');
  p.up();
  const q = finger(f.button);
  q.down(); q.up();
  ok(pressed(f), 'a quick tap flashes');
  await wait(150);
  ok(!pressed(f), 'and clears');
  f.remove();
});

test('pressable: a scroll creeping to rest does not block a tap', async () => {
  const f = fixture();
  f.root.dispatchEvent(new Event('scroll'));
  f.root.dispatchEvent(new Event('scroll')); // same position: settled
  const p = finger(f.button);
  p.down(); p.up(); f.button.click();
  eq(f.clicks(), 1, 'the tap counts');
  f.remove();
});

test('pressable: a slide off one control swallows clicks across its group', async () => {
  const f = fixture();
  const other = f.root.appendChild(document.createElement('button'));
  let otherClicks = 0;
  other.addEventListener('click', () => otherClicks++);
  const p = finger(f.button);
  p.down(); p.move(0, FAR); p.up();
  other.click();
  eq(otherClicks, 0, 'a click elsewhere in the group is swallowed');
  await wait(450);
  f.remove();
});

test('pressable: clicks without a touch (mouse, keyboard) always count', async () => {
  const f = fixture();
  f.button.click();
  eq(f.clicks(), 1, 'clicks');
  f.remove();
});
