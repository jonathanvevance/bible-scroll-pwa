import en from './en.js';
import ml from './ml.js';

/** The language this page is for: `data-bible` on its <html>, English when there is none. */
export const lang = { en, ml }[document.documentElement.dataset.bible ?? 'en'];
