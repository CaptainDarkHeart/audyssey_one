// All shared mutable runtime state. Imported by every module that reads or
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
