import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundToNearestHalf,
  roundToPrecision,
  formatTime,
  freqToIndex,
  freqToIndexLinear,
  rmsErrorBetween,
  rmsDeficit,
  findBestSPLOffset,
  findBestLevelDeduction,
  getDistancePure,
} from '../src/utils.js';

// ── roundToNearestHalf ────────────────────────────────────────────────────────

test('roundToNearestHalf: rounds 1.3 → 1.5', () => {
  assert.equal(roundToNearestHalf(1.3), 1.5);
});
test('roundToNearestHalf: rounds 1.2 → 1.0', () => {
  assert.equal(roundToNearestHalf(1.2), 1.0);
});
test('roundToNearestHalf: exact half passes through', () => {
  assert.equal(roundToNearestHalf(2.5), 2.5);
});
test('roundToNearestHalf: handles negative values', () => {
  assert.equal(roundToNearestHalf(-1.3), -1.5);
  assert.equal(roundToNearestHalf(-1.2), -1.0);
});

// ── roundToPrecision ──────────────────────────────────────────────────────────

test('roundToPrecision: default precision 10', () => {
  assert.equal(roundToPrecision(1.23456789012345), 1.2345678901);
});
test('roundToPrecision: precision 2', () => {
  assert.equal(roundToPrecision(1.456, 2), 1.46);
});
test('roundToPrecision: precision 0 rounds to integer', () => {
  assert.equal(roundToPrecision(2.6, 0), 3);
});
test('roundToPrecision: removes floating-point noise', () => {
  const noisy = 0.1 + 0.2; // 0.30000000000000004
  assert.equal(roundToPrecision(noisy, 6), 0.3);
});

// ── formatTime ────────────────────────────────────────────────────────────────

test('formatTime: seconds only', () => {
  assert.equal(formatTime(45), '45 seconds');
});
test('formatTime: singular second', () => {
  assert.equal(formatTime(1), '1 second');
});
test('formatTime: exact minutes', () => {
  assert.equal(formatTime(120), '2 minutes');
});
test('formatTime: singular minute', () => {
  assert.equal(formatTime(60), '1 minute');
});
test('formatTime: minutes and seconds', () => {
  assert.equal(formatTime(90), '1 minute and 30 seconds');
});
test('formatTime: plural minutes and singular second', () => {
  assert.equal(formatTime(121), '2 minutes and 1 second');
});

// ── freqToIndex ───────────────────────────────────────────────────────────────

test('freqToIndex: same freq as start → 0', () => {
  assert.equal(freqToIndex(20, 20, 96), 0);
});
test('freqToIndex: one octave up', () => {
  assert.equal(freqToIndex(40, 20, 96), 96);
});
test('freqToIndex: two octaves up', () => {
  assert.equal(freqToIndex(80, 20, 96), 192);
});

// ── freqToIndexLinear ─────────────────────────────────────────────────────────

test('freqToIndexLinear: same freq as start → 0', () => {
  assert.equal(freqToIndexLinear(20, 20, 1), 0);
});
test('freqToIndexLinear: step of 5 Hz', () => {
  assert.equal(freqToIndexLinear(100, 20, 5), 16);
});

// ── rmsErrorBetween ───────────────────────────────────────────────────────────

test('rmsErrorBetween: identical arrays → 0', () => {
  assert.equal(rmsErrorBetween([1, 2, 3], [1, 2, 3]), 0);
});
test('rmsErrorBetween: constant offset of 1 → 1', () => {
  assert.equal(rmsErrorBetween([2, 3, 4], [1, 2, 3]), 1);
});
test('rmsErrorBetween: known value', () => {
  // diffs [1, -1] → squares [1, 1] → mean 1 → sqrt 1
  assert.equal(rmsErrorBetween([2, 0], [1, 1]), 1);
});
test('rmsErrorBetween: throws on length mismatch', () => {
  assert.throws(() => rmsErrorBetween([1, 2], [1]), /same length/);
});

// ── rmsDeficit ────────────────────────────────────────────────────────────────

test('rmsDeficit: no deficit samples → 0', () => {
  assert.equal(rmsDeficit([5, 5, 5], [3, 3, 3]), 0);
});
test('rmsDeficit: all deficit → same as rmsErrorBetween', () => {
  // measured all below target: [0,0] vs [2,2] → diffs [2,2] → rms 2
  assert.equal(rmsDeficit([0, 0], [2, 2]), 2);
});
test('rmsDeficit: mixed — only penalises deficits', () => {
  // measured [0, 5] vs target [2, 1]: index 0 is deficit (-2), index 1 is above
  // → rms of [2] = 2
  assert.equal(rmsDeficit([0, 5], [2, 1]), 2);
});

// ── findBestSPLOffset ─────────────────────────────────────────────────────────

test('findBestSPLOffset: flat match at 0', () => {
  const sig = [70, 70, 70];
  const tgt = [70, 70, 70];
  assert.equal(findBestSPLOffset(sig, tgt), 0);
});
test('findBestSPLOffset: signal 3dB low → best offset +3', () => {
  const sig = [67, 67, 67];
  const tgt = [70, 70, 70];
  assert.equal(findBestSPLOffset(sig, tgt), 3);
});
test('findBestSPLOffset: signal 3dB high → best offset -3', () => {
  const sig = [73, 73, 73];
  const tgt = [70, 70, 70];
  assert.equal(findBestSPLOffset(sig, tgt), -3);
});
test('findBestSPLOffset: clamps to ±12.5 dB range', () => {
  const sig = [50, 50, 50];
  const tgt = [70, 70, 70]; // 20dB gap — best available is +12.5
  assert.equal(findBestSPLOffset(sig, tgt), 12.5);
});

// ── findBestLevelDeduction ────────────────────────────────────────────────────

test('findBestLevelDeduction: all equal alignments → adjustments all 0', () => {
  const { bestAdjustments } = findBestLevelDeduction([3, 3, 3]);
  assert.deepEqual(bestAdjustments, [0, 0, 0]);
});
test('findBestLevelDeduction: single channel → adjustment 0, deduction = that value', () => {
  const { bestDeduction, bestAdjustments } = findBestLevelDeduction([2.5]);
  assert.equal(bestDeduction, 2.5);
  assert.deepEqual(bestAdjustments, [0]);
});
test('findBestLevelDeduction: two channels differing by 1dB', () => {
  // alignments [0, 1]: best deduction is 0 or 1
  // deduct 0 → [0, 1] → rounded [0, 1] → errors [0, 0] → absError 0
  // deduct 1 → [-1, 0] → rounded [-1, 0] → errors [0, 0] → absError 0
  // tie broken by smaller deduction → 0
  const { bestDeduction, bestAdjustments } = findBestLevelDeduction([0, 1]);
  assert.equal(bestDeduction, 0);
  assert.deepEqual(bestAdjustments, [0, 1]);
});
test('findBestLevelDeduction: returns arrays of multiples of 0.5', () => {
  const alignments = [0.1, 0.7, 1.3, -0.4];
  const { bestAdjustments } = findBestLevelDeduction(alignments);
  for (const adj of bestAdjustments) {
    assert.equal(Math.abs(adj % 0.5), 0, `${adj} is not a multiple of 0.5`);
  }
});

// ── getDistancePure ───────────────────────────────────────────────────────────

function makeChannels(distance, customDistance) {
  return [
    {},
    { channelReport: { distance }, customDistance },
  ];
}

test('getDistancePure: uses channelReport.distance when valid', () => {
  const { dist, noDistance } = getDistancePure(makeChannels('3.5', null), 0, 343);
  assert.equal(dist, 3.5);
  assert.equal(noDistance, false);
});
test('getDistancePure: falls back to customDistance when report is 0', () => {
  const { dist, noDistance } = getDistancePure(makeChannels('0', '4.2'), 0, 343);
  assert.equal(dist, 4.2);
  assert.equal(noDistance, false);
});
test('getDistancePure: falls back to 2.75 when both missing', () => {
  const { dist, noDistance } = getDistancePure(makeChannels('0', '0'), 0, 343);
  assert.equal(dist, 2.75);
  assert.equal(noDistance, true);
});
test('getDistancePure: centerSpeakerDistance overrides everything', () => {
  // 686 / 343 * 300 = 600
  const { dist, noDistance } = getDistancePure(makeChannels('0', '0'), 686, 300);
  assert.equal(dist, 600);
  assert.equal(noDistance, false);
});
test('getDistancePure: centerSpeakerDistance=0 does not override', () => {
  const { dist } = getDistancePure(makeChannels('3.0', null), 0, 343);
  assert.equal(dist, 3.0);
});
