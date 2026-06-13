/**
 * Extracts the inline JavaScript from nexus.html into ES module source files.
 * Run once: node scripts/extract-modules.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'nexus.html'), 'utf8');
const LINES = html.split('\n');

// ─── helpers ────────────────────────────────────────────────────────────────

function L(start, end) {
  return LINES.slice(start - 1, end).join('\n');
}

// Strip the 4-space HTML indent from extracted code lines.
function dedent(code) {
  return code.replace(/^    /gm, '');
}

// All mutable runtime state variables – replace bare name with state.name.
// Lookbehind/lookahead ensures we skip object-key positions and existing
// state. prefixes.
const STATE_VARS = [
  'jsonData','fileName','sOs','isCirrusLogic','hasxo180','cDist','nSpeakers',
  'subLO','subHI','noDistance','mSec','customLevel','customDistance',
  'customCrossover','commandId','delayAdjustment','freqIndex','freqLength',
  'maxNegative','maxPositive','targetCurvePath','targetLevel','targetArray',
  'lfePlusMain','bassExtractionLPF','solution','bassMode','numSub','subLPF',
  'swChannelCount','msecMin','msecMax','invertSub','msecMinSub','msecMaxSub',
  'previousDelay','isPaused','dontStart','targetResponse',
  // UI-toggled flags (defaults live in state, updated by checkboxes)
  'forceSmall','forceWeak','forceCentre','forceLarge','noInversion','limitLPF',
];

function withState(code) {
  // Pass 1: replace all bare occurrences of each state variable name
  for (const v of STATE_VARS) {
    code = code.replace(
      new RegExp(`(?<![\\w.$])${v}(?![\\w$:])`, 'g'),
      `state.${v}`
    );
  }
  // Pass 2: undo false positives where the variable was being declared
  // e.g. `let state.targetArray` → `let targetArray`
  for (const v of STATE_VARS) {
    code = code.replace(
      new RegExp(`\\b(let|const|var)\\s+state\\.${v}\\b`, 'g'),
      `$1 ${v}`
    );
  }
  // Guard against accidental double-prefix
  code = code.replace(/state\.state\./g, 'state.');
  return code;
}

function write(relPath, content) {
  const abs = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  console.log(`wrote ${relPath} (${content.split('\n').length} lines)`);
}

// ─── src/data/receivers.js ───────────────────────────────────────────────────

write('src/data/receivers.js', dedent(`${L(457, 471)}

export { modelsSoS300, micCalProb, noxo180 };
`));

// ─── src/data/mic-cal.js ─────────────────────────────────────────────────────
// antiMicCal starts at 5191 and ends just before (function() at 21575.
// Find the actual closing '];' line after 5191.
let micCalEnd = 5191;
while (micCalEnd < LINES.length && !LINES[micCalEnd - 1].trimEnd().endsWith('];')) micCalEnd++;

write('src/data/mic-cal.js', dedent(`${L(5191, micCalEnd)}

export { antiMicCal };
`));

// ─── src/config.js ───────────────────────────────────────────────────────────

write('src/config.js', dedent(`// ── Customization parameters ────────────────────────────────────────────────
// These are the settings intended for advanced users to edit in source.
// UI-toggled flags (forceSmall, etc.) live in state.js instead.
${L(473, 513)}

export { endFrequency, maxBoost, perSpeakerXOSearchRange, CenterSpeakerDistance };
`));

// ─── src/state.js ────────────────────────────────────────────────────────────

write('src/state.js', `// All shared mutable runtime state. Imported by every module that reads or
// writes cross-function data. Use state.xxx everywhere instead of bare globals.
export const state = {
  // ── calibration file ──
  jsonData: null,
  fileName: null,

  // ── receiver capabilities ──
  sOs: null,
  isCirrusLogic: false,
  hasxo180: false,

  // ── speaker layout ──
  cDist: null,
  nSpeakers: null,
  subLO: null,
  subHI: null,
  noDistance: false,
  numSub: 1,
  swChannelCount: 0,
  bassMode: 'Standard',
  subLPF: [null, null, null, null],

  // ── per-channel maps ──
  mSec: [],
  customLevel: {},
  customDistance: {},
  customCrossover: {},
  commandId: {},
  delayAdjustment: {},

  // ── EQ ──
  freqIndex: [],
  freqLength: null,
  maxNegative: null,
  maxPositive: null,
  targetCurvePath: null,
  targetLevel: null,
  targetResponse: null,
  targetArray: [],

  // ── bass ──
  lfePlusMain: false,
  bassExtractionLPF: null,
  solution: false,

  // ── subwoofer alignment ──
  invertSub: [],
  msecMin: null,
  msecMax: null,
  msecMinSub: Infinity,
  msecMaxSub: -Infinity,
  previousDelay: null,

  // ── runtime control ──
  isPaused: false,
  dontStart: true,

  // ── UI-toggled config flags (defaults match the original source) ──
  forceSmall: false,
  forceWeak: false,
  forceCentre: false,
  forceLarge: false,
  noInversion: false,
  limitLPF: null,
};
`);

// ─── src/rew-api.js ──────────────────────────────────────────────────────────

const rewApiRaw = dedent(L(4881, 5190));
write('src/rew-api.js', `import { state } from './state.js';

export const baseUrl = 'http://localhost:4735/measurements';
export const speedDelay = 255;

${withState(rewApiRaw).replace(/const baseUrl = 'http.*?', speedDelay = \d+;?\n?/, '')}

export {
  enableBlock, fetch_mREW, postNext, postNext2, postSafe, postDelete,
  fetchSafe, postAlign, fetchAlign, disableBlock, disableGraph, enableGraph,
  clearCommands,
};
`);

// ─── src/signal.js ───────────────────────────────────────────────────────────

const signalRaw = dedent([L(2171, 2230), L(2231, 2311), L(2312, 2339), L(2475, 2511), L(2512, 2535), L(2536, 2560)].join('\n'));
write('src/signal.js', `import { state } from './state.js';
import { baseUrl, speedDelay, fetch_mREW, postNext, postNext2, postSafe, fetchSafe, postAlign, fetchAlign } from './rew-api.js';

${withState(signalRaw)}

export { rmsVolume, subIRP, rmsError, calcEP, genSub, genSpeaker };
`);

// ─── src/alignment.js ────────────────────────────────────────────────────────

const alignRaw = dedent([L(1780, 1852), L(1853, 1854), L(1855, 1982), L(2340, 2410), L(2411, 2474)].join('\n'));
write('src/alignment.js', `import { state } from './state.js';
import { baseUrl, speedDelay, fetch_mREW, postNext, postSafe, fetchSafe, postAlign, fetchAlign } from './rew-api.js';
import { calcEP } from './signal.js';

${withState(alignRaw)}

export { alignCenter, alignSurrounds, epAlign, align4impulse, alignMsub };
`);

// ─── src/crossover.js ────────────────────────────────────────────────────────

const xoRaw = dedent([L(1324, 1658), L(1659, 1697), L(1983, 2040), L(2041, 2084), L(2085, 2170)].join('\n'));
write('src/crossover.js', `import { state } from './state.js';
import { baseUrl, speedDelay, fetch_mREW, postNext, postNext2, postSafe, fetchSafe, postAlign, fetchAlign } from './rew-api.js';
import { genSub, rmsError } from './signal.js';
import { epAlign, alignCenter, alignSurrounds, alignMsub } from './alignment.js';

${withState(xoRaw)}

export { aceXO, largeSpeakers, findXO, multipleSubs, tectonic };
`);

// ─── src/filters.js ──────────────────────────────────────────────────────────

const filtersRaw = dedent(L(2561, 4880));
write('src/filters.js', `import { state } from './state.js';
import { endFrequency, maxBoost } from './config.js';
import { antiMicCal } from './data/mic-cal.js';
import { baseUrl, speedDelay, fetch_mREW, postNext, postNext2, postSafe, fetchSafe } from './rew-api.js';
import { genSub, genSpeaker, subIRP } from './signal.js';
import { tectonic } from './crossover.js';

${withState(filtersRaw)}

export { updateAdy };
`);

// ─── src/calibration.js ──────────────────────────────────────────────────────

const calRaw = dedent([L(522, 631), L(791, 829), L(632, 695), L(696, 790)].join('\n'));
write('src/calibration.js', `import { state } from './state.js';
import { modelsSoS300, micCalProb, noxo180 } from './data/receivers.js';
import { antiMicCal } from './data/mic-cal.js';
import { baseUrl, speedDelay, fetch_mREW, postSafe, postDelete } from './rew-api.js';

${withState(calRaw)}

export { extractAdy, saveBaseJson, saveDeqBaseJson, getDistance, sortREW, compareREW };
`);

// ─── src/pipeline.js ─────────────────────────────────────────────────────────

const pipeRaw = dedent([
  L(933, 940),   // checkIfPaused
  L(941, 1021),  // optimizeOCA
  L(1022, 1069), // bootUp
  L(1070, 1184), // groundWorks
  L(1185, 1198), // optimizeLevels
  L(1199, 1269), // generateFilters
  L(1270, 1323), // witchCraft
  L(1698, 1779), // drawResults
].join('\n'));
write('src/pipeline.js', `import { state } from './state.js';
import { baseUrl, speedDelay, fetch_mREW, postNext, postNext2, postSafe, postDelete, fetchSafe, enableBlock, disableBlock, enableGraph, disableGraph, clearCommands } from './rew-api.js';
import { rmsVolume, genSub } from './signal.js';
import { alignCenter } from './alignment.js';
import { aceXO } from './crossover.js';
import { updateAdy } from './filters.js';
import { sortREW } from './calibration.js';

${withState(pipeRaw)}

export { checkIfPaused, optimizeOCA, bootUp, groundWorks, optimizeLevels, generateFilters, witchCraft, drawResults };
`);

// ─── src/ui.js ───────────────────────────────────────────────────────────────

const uiRaw = dedent([L(830, 863), L(864, 911), L(912, 927), L(928, 932)].join('\n'));
// Console override IIFE — stop before the closing </script> tag
const consoleRaw = dedent(L(21575, 21632));

write('src/ui.js', `import { state } from './state.js';
import { extractAdy, saveBaseJson, saveDeqBaseJson } from './calibration.js';
import { optimizeOCA } from './pipeline.js';

${withState(uiRaw)}

export { startButton_clicked, updateCheckboxStates, updateSubwooferLPFState, togglePause };

// ── Console → UI log bridge ──────────────────────────────────────────────────
${consoleRaw}
`);

// ─── src/main.js ─────────────────────────────────────────────────────────────

write('src/main.js', `import { extractAdy, saveBaseJson, saveDeqBaseJson, compareREW } from './calibration.js';
import {
  startButton_clicked,
  updateCheckboxStates,
  updateSubwooferLPFState,
  togglePause,
} from './ui.js';

// Wire DOM event listeners (replaces inline onclick="..." attributes in HTML)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('button1').addEventListener('change', extractAdy);
  document.getElementById('startButton').addEventListener('click', startButton_clicked);
  document.getElementById('pauseButton').addEventListener('click', togglePause);
  document.getElementById('saveButton').addEventListener('click', saveBaseJson);
  document.getElementById('saveDEQButton').addEventListener('click', saveDeqBaseJson);
  document.getElementById('subwooferLPF').addEventListener('change', updateSubwooferLPFState);

  const checkboxIds = ['noInversion','forceSmall','forceWeak','forceCentre','forceLarge'];
  checkboxIds.forEach(id => {
    document.getElementById(id).addEventListener('change', () => updateCheckboxStates(id));
  });
});
`);

console.log('\nDone. Run: npm run build');
