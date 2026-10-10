// GeoSquare — web board.
//
// A playable taste of the daily 3x3 grid, so a link can be clicked and played
// in ten seconds instead of installed. The three-game app is the product; this
// is one game of it, deliberately.
//
// It runs entirely in the browser. There is no backend and no account, for the
// same reason the app has neither: the puzzle is a function of the date.
// Unlike the app it does NOT keep a streak — a browser's storage is not
// durable enough to promise one (iOS Safari discards site data after a week
// unvisited), and a streak we cannot keep is a promise we should not make.
// Today's progress is all that is stored, so a refresh does not restart you.

const STORE = 'geosquare_web';
// Kept apart from the day's save, which is dropped at every rollover — the
// rules are read once and should stay read.
const SEEN_RULES = 'geosquare_web_rules_seen';
const LANG_STORE = 'geosquare_web_lang';

// ---------------------------------------------------------------- language
// The board itself stays English — that is the rule the page states and the
// reason everyone plays the same puzzle. Everything around it follows the
// browser, with an explicit choice that overrides the guess. (The app
// deliberately starts in English instead; a page is arrived at by link,
// often from a post in the reader's own language, so guessing is the better
// default here.)

let LANG = 'en';

/** The reader's own choice if they made one, otherwise the first of their
 *  browser's languages the page speaks, otherwise English. */
function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_STORE);
    if (LANGS.includes(saved)) return saved;
  } catch (e) { /* storage blocked — fall through to the browser's list */ }
  const wanted = navigator.languages && navigator.languages.length
    ? navigator.languages : [navigator.language || 'en'];
  for (const tag of wanted) {
    // "pt-BR" and "pt" both mean Portuguese here; regions do not differ.
    const base = String(tag).toLowerCase().split('-')[0];
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

/** Look up `key`, filling {placeholders} from `vars`. Falls back to English
 *  for a key a language is missing, then to the key itself so a missing
 *  string is visible rather than blank. */
function t(key, vars) {
  let out = (STRINGS[LANG] && STRINGS[LANG][key]) || STRINGS.en[key] || key;
  if (vars) {
    for (const name of Object.keys(vars)) out = out.split(`{${name}}`).join(vars[name]);
  }
  return out;
}

/** A category's header text in the current language.
 *
 *  Written defensively because the two files can be cached independently:
 *  a browser holding yesterday's puzzles.json, whose labels were a flat
 *  id→English map, against today's app.js asking for a language. Falling
 *  through to the flat map keeps that visitor's board readable instead of
 *  throwing out their save. */
const catLabel = (id) => {
  const all = PUZZLES.categoryLabels || {};
  const table = all[LANG] || all.en || all;
  return table[id] || id;
};

/** English dates lead with the day, like every other language here and like
 *  the app, which pins English to en_GB for exactly this. */
const dateLocale = () => (LANG === 'en' ? 'en-GB' : LANG);

// Flags follow the app's picker: GB for English, BR for Portuguese.
const LANG_FLAG = { en: 'gb', tr: 'tr', es: 'es', pt: 'br', fr: 'fr' };

function setLang(lang, { remember = true } = {}) {
  if (!LANGS.includes(lang)) return;
  LANG = lang;
  if (remember) { try { localStorage.setItem(LANG_STORE, lang); } catch (e) {} }
  applyLang();
}

/** Push the current language through every piece of text on the page. The
 *  static copy is marked up in the HTML rather than listed here, so adding
 *  a line to the page does not mean remembering to translate it in JS. */
function applyLang() {
  document.documentElement.lang = LANG;
  document.title = t('doc_title');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  // Only our own strings, and only the few that carry a <b> around a game name.
  for (const el of document.querySelectorAll('[data-t-html]')) el.innerHTML = t(el.dataset.tHtml);
  for (const el of document.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria));
  for (const el of document.querySelectorAll('[data-t-ph]')) el.placeholder = t(el.dataset.tPh);

  $('#langcode').textContent = LANG.toUpperCase();
  $('#langflag').src = `flags/${LANG_FLAG[LANG]}.png`;
  // Apple ships the badge per language; swapping it is the whole point of
  // having five. Its alt carries the link's purpose, since the artwork's
  // own words are paths and a screen reader sees nothing.
  $('#storebadge').src = `art/appstore/${LANG}.svg`;
  $('#storebadge').alt = t('get_app');
  for (const el of document.querySelectorAll('#langmenu button')) {
    el.setAttribute('aria-current', String(el.dataset.lang === LANG));
  }

  if (state) render();
  if (openCell !== null) { renderContext(); renderHits(); }
}
const APP_URL = 'https://apps.apple.com/app/id6812675483';

let DATA = null;      // countries.json
let PUZZLES = null;   // puzzles.json — frozen output of the app's generator
let state = null;

// ---------------------------------------------------------------- utilities

/** Local calendar date as yyyy-MM-dd, matching how the app names its day. */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The app's own flag artwork. Regional-indicator emoji were the obvious
 *  shortcut and the wrong one: Windows has no flag glyphs at all and renders
 *  bare country codes, so a desktop visitor would see "FR" where the app
 *  shows a flag. These are the same PNGs the app ships, loaded only for the
 *  countries actually drawn. */
function flag(iso2, cls = 'fl') {
  return `<img class="${cls}" src="flags/${iso2}.png" alt="" loading="lazy">`;
}

// Mirrors SearchNormalizer in the app: case, accents and the Turkish dotless
// i all collapse, so "Bogotá", "BOGOTA" and a Turkish keyboard's "Tıra" match
// the same ASCII dataset.
function key(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/İ/g, 'i').toLowerCase().trim();
}
function words(text) {
  return key(text).split(/[ \-'’]+/).filter(Boolean);
}

// ------------------------------------------------------------------ scoring
// Ported from GridScoring.swift. Every number the board shows has to match
// what the app would show for the same cell and the same pick.

function difficulty(n) {
  if (n <= 2) return 5;
  if (n <= 5) return 4;
  if (n <= 10) return 3;
  if (n <= 20) return 2;
  return 1;
}

/** (rarity, name) ordering — the dataset is ASCII, so a plain string compare
 *  matches Swift's. */
function before(a, b) {
  return a.rarity_score !== b.rarity_score
    ? a.rarity_score - b.rarity_score
    : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** 1-5 by where the pick ranks among the cell's candidates. A country that is
 *  not a candidate is scored at the rank it would hold, so the badge cannot be
 *  read as a validity tell. */
function quality(country, candidates) {
  const sorted = [...candidates].sort(before);
  let rank, total;
  const found = sorted.findIndex((c) => c.iso2 === country.iso2);
  if (found >= 0) {
    rank = found; total = sorted.length;
  } else {
    rank = sorted.filter((c) => before(c, country) < 0).length;
    total = sorted.length + 1;
  }
  if (total <= 1) return 5;
  return 1 + Math.round((rank / (total - 1)) * 4);
}

const candidatesFor = (row, col) => DATA.filter((c) => c[row] && c[col]);

// -------------------------------------------------------------------- state

function freshState(date) {
  const g = PUZZLES.grids[date];
  if (!g) return null;
  const names = PUZZLES.categories;
  const rows = g[0].map((i) => names[i]);
  const cols = g[1].map((i) => names[i]);
  return {
    date, rows, cols, max: g[2],
    cells: Array.from({ length: 9 }, () => null),  // iso2 | null
    points: Array.from({ length: 9 }, () => 0),
    wrong: Array.from({ length: 9 }, () => []),
    compass: Array.from({ length: 9 }, () => false),  // opened by the compass
    compassUsed: false,
    mistakes: 0,
    finished: false,
  };
}

/** Fit a save written by an older build onto the current shape.
 *
 *  A save handed straight back is missing whatever the build has gained
 *  since it was written. That is not hypothetical: a game saved before the
 *  compass existed had no `compass` array, render() read `state.compass[i]`
 *  and threw, and the page came up with the header and no board — nothing
 *  the player could do about it but know to clear site data. Since every
 *  future change ships to browsers already holding a save, the reconcile
 *  happens once here rather than as a guard at each use.
 *
 *  Keys the save lacks keep their fresh value; keys whose shape disagrees
 *  are ignored. A save for a different day or a different grid is not this
 *  puzzle's and is dropped whole.
 */
function reconcile(saved, fresh) {
  if (!saved || !fresh || saved.date !== fresh.date) return null;
  if (String(saved.rows) !== String(fresh.rows)) return null;
  if (String(saved.cols) !== String(fresh.cols)) return null;
  const out = { ...fresh };
  for (const [k, v] of Object.entries(fresh)) {
    const got = saved[k];
    if (got === undefined) continue;                 // added after this save
    if (Array.isArray(v)) {
      if (Array.isArray(got) && got.length === v.length) out[k] = got;
    } else if (typeof got === typeof v) {
      out[k] = got;
    }
  }
  return out;
}

function load() {
  const date = today();
  const fresh = freshState(date);
  let saved = null;
  try {
    // Yesterday's save is simply dropped: one puzzle a day, no history here.
    saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  } catch (e) { /* private browsing, or cleared storage — start fresh */ }
  return reconcile(saved, fresh) || fresh;
}

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
}

const LIVES = 4;
const livesLeft = () => Math.max(0, LIVES - state.mistakes);
const filled = () => state.cells.filter(Boolean).length;
const score = () => state.points.reduce((a, b) => a + b, 0);
const isOver = () => filled() === 9 || livesLeft() === 0;

// ------------------------------------------------------------------ compass
// One a day. Armed by the pill, spent by tapping a square, which fills with
// the most ordinary country that fits — for zero points, but without costing
// a heart. Lives are this game's tension, so the compass is paid for in score
// instead. It matters more here than in the app: someone trying the game for
// the first time, stuck on three squares with no way out, just closes the tab.

let compassArmed = false;

// The app draws SF Symbols' safari.fill in warm yellow and turns it a full
// circle every four seconds. There are no SF Symbols on the web, so the same
// shape is drawn: a warm disc with the needle masked out of it, letting the
// card show through the cut exactly as the symbol does.
const COMPASS_SVG = `
  <svg class="needle" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="47" fill="#FFC93C" mask="url(#compass-needle)"/>
  </svg>`;

// The same symbol in white, for the blue coin that marks a square the
// compass opened — the app badges those rather than printing "+0".
const COMPASS_GLYPH = `
  <svg class="cglyph" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="47" fill="#fff" mask="url(#compass-needle)"/>
  </svg>`;

function showRules() {
  closeSearch();
  $('#htp').hidden = false;
  // On a phone the sheet is taller than the screen. Focusing the button
  // plainly scrolled it into view, so the sheet opened on rule three and a
  // first-time visitor never saw the title or the first two rules.
  $('.sheet.htp').scrollTop = 0;
  $('#htpok').focus({ preventScroll: true });
}

/** Dismissing is what marks the rules as read, not opening them. Writing
 *  the flag on open spent the one automatic showing on any load that never
 *  reached a reader — a prefetch, or a tab closed on the spot. */
function hideRules() {
  $('#htp').hidden = true;
  try { localStorage.setItem(SEEN_RULES, '1'); } catch (e) {}
}

function toggleCompass() {
  if (state.compassUsed || state.finished) return;
  compassArmed = !compassArmed;
  render();
}

function useCompass(i) {
  const r = Math.floor(i / 3), c = i % 3;
  const used = new Set(state.cells.filter(Boolean));
  const open = candidatesFor(state.rows[r], state.cols[c])
    .filter((x) => !used.has(x.iso2));
  if (!open.length) {           // nothing left that is not already placed:
    compassArmed = false;       // keep the compass rather than spend it on nothing
    render();
    return;
  }
  const pick = open.reduce((a, b) => (before(a, b) <= 0 ? a : b));  // most common
  state.cells[i] = pick.iso2;
  state.points[i] = 0;
  state.compass[i] = true;
  state.compassUsed = true;
  compassArmed = false;
  if (isOver()) state.finished = true;
  save();
  render();
}

// ------------------------------------------------------------------- search
// Country names in all five of the app's languages, free from the browser's
// own CLDR data — the same source the app reads through Locale. A Turkish
// player types "Cezayir" and places Algeria; the board stays English so every
// player is solving the same puzzle.

// LANGS comes from strings.js. The set a player can type in and the set the
// page can be read in are the same set on purpose — both are the app's five
// languages, and splitting them would let one drift from the other.
let ALIASES = new Map();   // iso2 -> [{name, lang}]

function buildAliases() {
  const display = {};
  for (const l of LANGS) {
    try { display[l] = new Intl.DisplayNames([l], { type: 'region' }); }
    catch (e) { /* older browser: English-only search still works */ }
  }
  for (const c of DATA) {
    const out = [{ name: c.name, lang: null }];
    const region = c.iso2.toUpperCase();
    for (const l of LANGS) {
      try {
        const n = display[l] && display[l].of(region);
        if (n && n !== region) out.push({ name: n, lang: l });
      } catch (e) {}
    }
    for (const extra of (EXTRA[c.iso2] || [])) out.push(extra);
    // CLDR repeats the English spelling in other languages for a good many
    // countries; indexing it five times is pure waste.
    const seen = new Set();
    ALIASES.set(c.iso2, out.filter((a) => {
      const k = key(a.name);
      return k && !seen.has(k) && seen.add(k);
    }).map((a) => ({ ...a, k: key(a.name), w: words(a.name) })));
  }
}

// The handful of real names CLDR does not give, matching CountryAliases.swift.
const EXTRA = {
  gb: [{ name: 'İngiltere', lang: 'tr' }],
  ci: [{ name: 'Fildişi Sahili', lang: 'tr' }, { name: 'Ivory Coast', lang: 'en' },
       { name: 'Costa de Marfil', lang: 'es' }, { name: 'Costa do Marfim', lang: 'pt' }],
  sz: [{ name: 'Swaziland', lang: 'en' }],
  mm: [{ name: 'Burma', lang: 'en' }],
};

/** Prefix match on the whole name or any word of it, across every spelling. */
function search(q) {
  const qk = key(q);
  if (qk.length < 3) return [];
  const used = new Set(state.cells.filter(Boolean));
  const hits = [];
  for (const c of DATA) {
    if (used.has(c.iso2)) continue;              // one country per grid
    const match = ALIASES.get(c.iso2).find(
      (a) => a.k.startsWith(qk) || a.w.some((w) => w.startsWith(qk)));
    if (match) hits.push({ country: c, alias: match.lang ? match.name : null });
  }
  return hits.sort((a, b) => a.country.name < b.country.name ? -1 : 1).slice(0, 10);
}

// ------------------------------------------------------------------ sharing
// The same emoji grid the app produces, because this is the artifact that
// travels: people post the grid, not a link.

/** GridScoring.tierColor's four bands, as a class name. The payout chip is
 *  coloured by tier in the app, which is what tells a player at a glance
 *  whether a pick is the safe one or the rare one. */
function tierClass(points) {
  if (points <= 4) return 't1';
  if (points <= 6) return 't2';
  if (points <= 8) return 't3';
  return 't4';
}

/** GridScoring.tierEmoji — the same four tiers the app uses, so two people
 *  posting the same day's grid post the same alphabet. */
function tierEmoji(points) {
  if (points <= 4) return '🟩';
  if (points <= 6) return '🟨';
  if (points <= 8) return '🟧';
  return '🟪';
}

function shareText() {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    let line = '';
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      line += !state.cells[i] ? '⬜'
            : state.compass[i] ? '🧭' : tierEmoji(state.points[i]);
    }
    rows.push(line);
  }
  // Hearts exactly as GameGrid.shareText spells them: kept, then lost.
  const hearts = '❤️'.repeat(livesLeft()) + '🖤'.repeat(Math.min(state.mistakes, LIVES));
  return `GeoSquare ${state.date}\n${rows.join('\n')}\n`
    + `${filled()}/9 — ${score()}/${state.max} pts — ${hearts}\n${location.href}`;
}

// --------------------------------------------------------------- rendering

const $ = (sel) => document.querySelector(sel);
let openCell = null;   // index of the cell the search panel is filling

function render() {
  $('#date').textContent = new Date(state.date + 'T00:00:00')
    .toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' });
  $('#score').textContent = `${filled()}/9`;
  $('#points').textContent = `${score()}/${state.max}`;
  $('#lives').textContent = '❤️'.repeat(livesLeft()) + '🖤'.repeat(LIVES - livesLeft());

  const compass = $('#compass');
  compass.hidden = state.finished && !state.compassUsed ? false : false;
  compass.classList.toggle('armed', compassArmed);
  compass.classList.toggle('spent', state.compassUsed);
  compass.disabled = state.compassUsed || state.finished;
  compass.title = state.compassUsed ? t('compass_spent')
    : compassArmed ? t('compass_armed') : t('a11y_compass');

  $('#cols').innerHTML = '<div></div>' +
    state.cols.map((c) => `<div class="head">${catLabel(c)}</div>`).join('');

  $('#grid').innerHTML = state.rows.map((rowCat, r) => {
    const head = `<div class="head row">${catLabel(rowCat)}</div>`;
    const cells = state.cols.map((_, c) => {
      const i = r * 3 + c;
      const iso = state.cells[i];
      if (!iso) {
        const dead = state.finished ? ' dead' : '';
        // Armed: every empty square shows the compass instead of "?", which is
        // how the app signals that the next tap spends it.
        const armed = compassArmed && !state.finished ? ' armed' : '';
        const face = armed ? COMPASS_SVG : '?';
        return `<button class="cell empty${dead}${armed}" data-i="${i}" ${state.finished ? 'disabled' : ''}>${face}</button>`;
      }
      const country = DATA.find((x) => x.iso2 === iso);
      // A compass square is marked rather than showing "+0": the grid should
      // never look as though an ordinary answer scored nothing.
      const badge = state.compass[i]
        ? '<span class="pts compass">' + COMPASS_GLYPH + '</span>'
        : `<span class="pts ${tierClass(state.points[i])}">+${state.points[i]}</span>`;
      return `<div class="cell filled">
                ${badge}
                ${flag(iso)}
                <span class="nm">${country.name}</span>
              </div>`;
    }).join('');
    return head + cells;
  }).join('');

  $('#result').hidden = !state.finished;
  if (state.finished) {
    const won = filled() === 9;
    $('#verdict').textContent = won
      ? (score() === state.max && !state.compassUsed ? t('verdict_perfect') : t('verdict_done'))
      : t('verdict_lost');
    $('#final').textContent = t('result_line',
      { f: filled(), s: score(), m: state.max });
    $('#emoji').textContent = shareText().split('\n').slice(1, 4).join('\n');
  }
}

function openSearch(i) {
  openCell = i;
  renderContext();
  $('#q').value = '';
  $('#hits').innerHTML = '';
  $('#panel').hidden = false;
  $('#q').focus();
}

/** The search sheet's header: what the square demands and how many answers
 *  exist. Separate from openSearch so a language change can redraw it
 *  without closing the sheet the reader is in the middle of using. */
function renderContext() {
  const r = Math.floor(openCell / 3), c = openCell % 3;
  const n = candidatesFor(state.rows[r], state.cols[c]).length;
  $('#must').innerHTML = t('must_be', {
    a: `<b>${catLabel(state.rows[r])}</b>`,
    b: `<b>${catLabel(state.cols[c])}</b>`,
  });
  $('#count').textContent = t(n === 1 ? 'possible_one' : 'possible_many', { n });
}

function closeSearch() {
  $('#panel').hidden = true;
  openCell = null;
}

function renderHits() {
  const r = Math.floor(openCell / 3), c = openCell % 3;
  const cands = candidatesFor(state.rows[r], state.cols[c]);
  const hits = search($('#q').value);
  $('#hits').innerHTML = hits.map(({ country, alias }) => {
    const pts = difficulty(cands.length) + quality(country, cands);
    return `<button class="hit" data-iso="${country.iso2}">
              ${flag(country.iso2, 'fl hitfl')}
              <span class="hitname">${country.name}${alias ? `<em>${alias}</em>` : ''}</span>
              <span class="badge ${tierClass(pts)}">+${pts}</span>
            </button>`;
  }).join('');
}

function submit(iso) {
  const i = openCell, r = Math.floor(i / 3), c = i % 3;
  const country = DATA.find((x) => x.iso2 === iso);
  const cands = candidatesFor(state.rows[r], state.cols[c]);
  if (cands.some((x) => x.iso2 === iso)) {
    state.cells[i] = iso;
    state.points[i] = difficulty(cands.length) + quality(country, cands);
    closeSearch();
  } else {
    // A wrong answer costs a heart; a correct one is free. Same rule as the
    // app, and the reason the game is about thinking before guessing.
    state.wrong[i].push(iso);
    state.mistakes += 1;
    $('#q').value = '';
    $('#hits').innerHTML = `<p class="err">${country.name} — ${t('not_valid')}</p>`;
  }
  if (isOver()) { state.finished = true; closeSearch(); }
  save();
  render();
}

// ------------------------------------------------------------------ wiring

async function boot() {
  // Revalidate rather than trust the cache: these two travel with app.js
  // and a stale one against fresh code is the whole class of bug above.
  // Unchanged, it costs a 304 and no body.
  const fresh = { cache: 'no-cache' };
  [DATA, PUZZLES] = await Promise.all([
    fetch('countries.json', fresh).then((r) => r.json()),
    fetch('puzzles.json', fresh).then((r) => r.json()),
  ]);
  buildAliases();
  LANG = detectLang();          // before the first paint, not after it
  state = load();
  if (!state) {                 // past the frozen horizon
    applyLang();
    $('#grid').innerHTML = '';
    $('#verdict').textContent = t('out_of_puzzles');
    $('#result').hidden = false;
    return;
  }
  // Last resort. reconcile() covers the shape changes we can foresee; if a
  // save still manages to break the first paint, throw it away and start the
  // day over rather than leave the player staring at a boardless page.
  try {
    applyLang();                // draws the board as well as the copy
  } catch (e) {
    console.error('discarding an unusable save', e);
    try { localStorage.removeItem(STORE); } catch (_) {}
    state = freshState(today());
    applyLang();
  }

  $('#grid').addEventListener('click', (e) => {
    const b = e.target.closest('.cell.empty');
    if (!b || state.finished) return;
    if (compassArmed) useCompass(Number(b.dataset.i));
    else openSearch(Number(b.dataset.i));
  });
  $('#hits').addEventListener('click', (e) => {
    const b = e.target.closest('.hit');
    if (b) submit(b.dataset.iso);
  });
  $('#q').addEventListener('input', renderHits);
  $('#close').addEventListener('click', closeSearch);
  $('#compass').addEventListener('click', toggleCompass);
  $('#help').addEventListener('click', showRules);
  $('#lang').addEventListener('click', (e) => {
    e.stopPropagation();        // the document handler below closes it again
    $('#langmenu').hidden = !$('#langmenu').hidden;
  });
  $('#langmenu').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    $('#langmenu').hidden = true;
    setLang(b.dataset.lang);
  });
  document.addEventListener('click', () => { $('#langmenu').hidden = true; });
  $('#htpok').addEventListener('click', hideRules);
  $('#htpclose').addEventListener('click', hideRules);
  $('#htp').addEventListener('click', (e) => {   // click the dimmed ground
    if (e.target === $('#htp')) hideRules();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#langmenu').hidden) $('#langmenu').hidden = true;
    else if (!$('#htp').hidden) hideRules();
    else if (!$('#panel').hidden) closeSearch();
  });

  // Same as the app's onboarding sheet: shown once, on a first visit. A
  // daily grid with no stated rules loses the person who arrived from a
  // link and has no idea what the two headers over a square mean.
  let seen = false;
  try { seen = localStorage.getItem(SEEN_RULES) === '1'; } catch (e) {}
  if (!seen) showRules();
  $('#share').addEventListener('click', async () => {
    const text = shareText();
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); $('#share').textContent = t('copied'); }
    } catch (e) { /* the user dismissed the sheet */ }
  });
}

boot();
