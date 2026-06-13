// Pure math utilities — no side effects, no state, no DOM.
// All functions here are unit-tested in tests/.

// ── Rounding ──────────────────────────────────────────────────────────────────

/** Rounds to the nearest 0.5 step (AVR volume is 0.5 dB resolution). */
export function roundToNearestHalf(num) {
  return Math.round(num * 2) / 2;
}

/** Rounds to an arbitrary decimal precision, avoiding floating-point drift. */
export function roundToPrecision(num, precision = 10) {
  const factor = Math.pow(10, precision);
  return Math.round(num * factor) / factor;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Formats a duration in seconds as a human-readable string. */
export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes === 0) {
    return `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

// ── Frequency ─────────────────────────────────────────────────────────────────

/**
 * Maps a frequency to a spectral array bin index using logarithmic (PPO) spacing.
 * This is the standard REW frequency response array addressing scheme.
 *
 * @param {number} freq      – target frequency in Hz
 * @param {number} startFreq – lowest frequency in the response array (Hz)
 * @param {number} ppo       – points per octave
 */
export function freqToIndex(freq, startFreq, ppo) {
  return Math.round(Math.log2(freq / startFreq) * ppo);
}

/**
 * Maps a frequency to a spectral array bin index using linear spacing.
 *
 * @param {number} freq      – target frequency in Hz
 * @param {number} startFreq – lowest frequency in the response array (Hz)
 * @param {number} freqStep  – Hz per bin
 */
export function freqToIndexLinear(freq, startFreq, freqStep) {
  return Math.round((freq - startFreq) / freqStep);
}

// ── RMS ───────────────────────────────────────────────────────────────────────

/**
 * Root-mean-square error between two equal-length arrays.
 * Used to measure how closely a speaker's SPL curve matches the target.
 *
 * @throws if arrays have different lengths
 */
export function rmsErrorBetween(a, b) {
  if (a.length !== b.length) {
    throw new Error(`rmsErrorBetween: arrays must be same length (${a.length} vs ${b.length})`);
  }
  let sumOfSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumOfSquares += diff * diff;
  }
  return Math.sqrt(sumOfSquares / a.length);
}

/**
 * RMS of only the deficit samples — positions where measured[i] < target[i].
 * Used to penalise dips below the target curve without penalising peaks.
 */
export function rmsDeficit(measured, target) {
  let sumOfSquares = 0;
  let count = 0;
  for (let i = 0; i < measured.length; i++) {
    if (measured[i] < target[i]) {
      const diff = target[i] - measured[i];
      sumOfSquares += diff * diff;
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sumOfSquares / count) : 0;
}

// ── Level optimisation ────────────────────────────────────────────────────────

/**
 * Searches [-12.5, +12.5] dB in 0.5 dB steps for the offset that minimises
 * RMS error between (signal + offset) and target.
 *
 * @param {number[]} signal  – measured SPL values
 * @param {number[]} target  – target SPL values (same length)
 * @returns {number} best offset in dB (multiple of 0.5)
 */
export function findBestSPLOffset(signal, target) {
  let bestOffset = 0;
  let lowestRms = Infinity;
  for (let offset = -12.5; offset <= 12.5; offset += 0.5) {
    const shifted = signal.map(v => v + offset);
    const rms = rmsErrorBetween(shifted, target);
    if (rms < lowestRms) {
      lowestRms = rms;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

/**
 * Finds the speaker level reference that minimises total rounding error when
 * all level adjustments are rounded to the nearest 0.5 dB.
 *
 * This drives the volume level calibration: given the raw SPL alignment values
 * for every channel, it returns the set of 0.5 dB-quantised adjustments that
 * collectively deviate least from the ideal float values.
 *
 * @param {number[]} alignments – required float level adjustments per channel
 * @returns {{ bestDeduction: number, bestAdjustments: number[] }}
 */
export function findBestLevelDeduction(alignments) {
  let bestDeduction = 0;
  let minTotalAbsError = Infinity;
  let minTotalDifference = Infinity;
  let bestAdjustments = [];

  for (let i = 0; i < alignments.length; i++) {
    const deduction = alignments[i];
    const current = alignments.map(a => a - deduction);
    const applied = current.map(adj => roundToNearestHalf(adj));
    applied[i] = 0;
    const errors = current.map((adj, idx) => adj - applied[idx]);
    const totalAbsError = roundToPrecision(errors.reduce((s, e) => s + Math.abs(e), 0), 6);
    const totalDifference = roundToPrecision(Math.abs(errors.reduce((s, e) => s + e, 0)), 6);

    if (
      totalAbsError < minTotalAbsError ||
      (roundToPrecision(totalAbsError, 6) === roundToPrecision(minTotalAbsError, 6) && totalDifference < minTotalDifference) ||
      (roundToPrecision(totalAbsError, 6) === roundToPrecision(minTotalAbsError, 6) &&
       roundToPrecision(totalDifference, 6) === roundToPrecision(minTotalDifference, 6) &&
       deduction < bestDeduction)
    ) {
      minTotalAbsError = totalAbsError;
      minTotalDifference = totalDifference;
      bestDeduction = deduction;
      bestAdjustments = applied;
    }
  }
  return { bestDeduction, bestAdjustments };
}

// ── Distance ──────────────────────────────────────────────────────────────────

/**
 * Pure core of getDistance: extracts center-speaker distance from Audyssey
 * channel data with fallback to default.
 *
 * Priority:
 *  1. channelReport.distance (from AVR measurement)
 *  2. customDistance (from .ady file)
 *  3. 2.75 m default
 * If centerSpeakerDistance > 0 it overrides everything, scaled by sOs/343.
 *
 * @returns {{ dist: number, noDistance: boolean }}
 */
export function getDistancePure(channels, centerSpeakerDistance, sOs) {
  let dist = parseFloat(channels[1].channelReport.distance);
  let noDistance = false;
  if (isNaN(dist) || dist === 0) {
    dist = parseFloat(channels[1].customDistance);
    if (isNaN(dist) || dist === 0 || dist == null) {
      dist = 2.75;
      noDistance = true;
    }
  }
  if (centerSpeakerDistance > 0) {
    dist = centerSpeakerDistance / 343 * sOs;
    noDistance = false;
  }
  return { dist, noDistance };
}
