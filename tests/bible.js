// The real Bible text, loaded once for every test file that needs it.

import { Bible } from '../src/core/bible.js';

let loading;
export const realBible = () => (loading ??= fetch(new URL('../bsb.json', import.meta.url)).then((r) => r.json()).then((data) => new Bible(data)));
