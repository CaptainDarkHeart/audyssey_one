import { state } from './state.js';
import { findBestSPLOffset } from './utils.js';
import { baseUrl, speedDelay, fetch_mREW, postNext, postNext2, postSafe, fetchSafe, postAlign, fetchAlign } from './rew-api.js';

async function rmsVolume(noM) {
  const measurements = await fetch_mREW();
  const mCount = Object.keys(measurements).length;
  await postNext('Smooth', noM, { smoothing: "None" });
  await fetchSafe('target-level', noM, state.targetLevel);
  await postNext('Generate target measurement', noM);
  console.info(`Aligning subwoofer volume to best track the target curve between 30Hz - 80Hz (Dolby standard)...`);
  const subArray = [];
  const freqResponse = await fetchSafe('frequency-response?smoothing=1%2F48&ppo=96', noM);
  let startFreq = freqResponse.startFreq;
  const oct = Math.pow(2, Math.sqrt(2) / 2);
  let k1 = 50 / oct, k2 = 50 * oct;
  let ppo = freqResponse.ppo;
  k1 = Math.round(Math.log2(k1 / startFreq) * ppo);
  k2 = Math.round(Math.log2(k2 / startFreq) * ppo);
  const bytes = Uint8Array.from(atob(freqResponse.magnitude), c => c.charCodeAt(0));
  const buffer = bytes.buffer;
  const data = new DataView(buffer);
  for (let k = k1; k <= k2; k++) {
    const splSub = data.getFloat32(k * 4)
    subArray.push(splSub);
  }
  const targetArray = [];
  const targetResponse = await fetchSafe('frequency-response?smoothing=1%2F48&ppo=96', mCount + 1);
  startFreq = state.targetResponse.startFreq;
  k1 = 50 / oct; k2 = 50 * oct;
  ppo = state.targetResponse.ppo;
  k1 = Math.round(Math.log2(k1 / startFreq) * ppo);
  k2 = Math.round(Math.log2(k2 / startFreq) * ppo);
  const bytesTarget = Uint8Array.from(atob(state.targetResponse.magnitude), c => c.charCodeAt(0));
  const bufferTarget = bytesTarget.buffer;
  const dataTarget = new DataView(bufferTarget);
  for (let k = k1; k <= k2; k++) {
    const splTarget = dataTarget.getFloat32(k * 4);
    state.targetArray.push(splTarget);
  }
  let bestOffset = findBestSPLOffset(subArray, state.targetArray);
  if (bestOffset <= 10) {bestOffset += 2};
  await postNext('Add SPL offset', noM, { offset: bestOffset });
  await postDelete(mCount + 1);
  console.log(`Subwoofer - applied adjustment: ${bestOffset}dB.`)
  return bestOffset;
}
async function subIRP(noM) {
  const measurements = await fetch_mREW();
  const mCount = Object.keys(measurements).length;
  await postNext('Smooth', noM, { smoothing: "None" });
  await postSafe(`${baseUrl}/${noM}/filters`, {
    filters: [{
      "index": 21,
      "type": "Low pass",
      "enabled": true,
      "isAuto": false,
      "frequency": 120,
      "shape": "L-R",
      "slopedBPerOctave": 24
    }]
  }, "Filters set");
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postNext('Generate filters measurement', noM);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postNext('Add SPL offset', mCount + 1, { offset: state.targetLevel });
  await postSafe(`${baseUrl}/${noM}/filters`, {
    filters: [{
      "index": 21,
      "type": "Low pass",
      "enabled": true,
      "isAuto": false,
      "frequency": 250,
      "shape": "L-R",
      "slopedBPerOctave": 24
    }]
  }, "Filters set");
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postNext('Generate filters measurement', noM);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postNext('Add SPL offset', mCount + 2, { offset: state.targetLevel });
  const magnitudeArray = [];
  const spResponse = await fetchSafe('frequency-response?smoothing=1%2F48&ppo=96', noM);
  startFreq = spResponse.startFreq;
  let k1 = 25, k2 = 250;
  ppo = spResponse.ppo;
  k1 = Math.round(Math.log2(k1 / startFreq) * ppo);
  k2 = Math.round(Math.log2(k2 / startFreq) * ppo);
  const bytes1 = Uint8Array.from(atob(spResponse.magnitude), c => c.charCodeAt(0));
  const buffer1 = bytes1.buffer;
  const data1 = new DataView(buffer1);
  for (let k = k1; k <= k2; k++) {
    const spMagnitude = data1.getFloat32(k * 4);
    magnitudeArray.push(spMagnitude);
  }
  let minSum = Infinity, sum, lpfCalculated, isRP = false;
  for (let i = mCount + 1; i <= mCount + 2; i++) {
    sum = 0;
    const lpfArray = [];
    const lpfResponse = await fetchSafe('frequency-response?smoothing=1%2F48&ppo=96', i);
    startFreq = lpfResponse.startFreq;
    k1 = 25; k2 = 250;
    ppo = lpfResponse.ppo;
    k1 = Math.round(Math.log2(k1 / startFreq) * ppo);
    k2 = Math.round(Math.log2(k2 / startFreq) * ppo);
    const bytesLPF = Uint8Array.from(atob(lpfResponse.magnitude), c => c.charCodeAt(0));
    const bufferLPF = bytesLPF.buffer;
    const dataLPF = new DataView(bufferLPF);
    let t = 0;
    for (let k = k1; k <= k2; k++) {
      const lpfMagnitude = dataLPF.getFloat32(k * 4);
      const dif = magnitudeArray[t] - lpfMagnitude;
      sum += dif * dif;
      t++;
    }
    const meanOfSquares = sum / t;
    const rmsE = Math.sqrt(meanOfSquares);
    if (rmsE < minSum) {
      minSum = rmsE;
      lpfCalculated = i;
    }
  }
  lpfCalculated === mCount + 1 ? lpfCalculated = 120 : lpfCalculated = 250;
  if (lpfCalculated === 120) {isRP = true}
  await postDelete(mCount + 2);
  await postDelete(mCount + 1);
  return isRP;
}
async function rmsError(noM) {
  const freqResponse = await fetchSafe('frequency-response?smoothing=1%2F48&ppo=96', noM);
  let startFreq = freqResponse.startFreq;
  let k1 = 20, k2 = 250;
  let ppo = freqResponse.ppo;
  k1 = Math.round(Math.log2(k1 / startFreq) * ppo);
  k2 = Math.round(Math.log2(k2 / startFreq) * ppo);
  const bytes = Uint8Array.from(atob(freqResponse.magnitude), c => c.charCodeAt(0));
  const buffer = bytes.buffer;
  const data = new DataView(buffer);
  let aSumArray = []
  for (let k = k1; k <= k2; k++) {
    const splSum = data.getFloat32(k * 4);
    aSumArray.push(splSum);
  };
  let sumOfSquares = 0;
  let count = 0;
  for (let i = 0; i < aSumArray.length; i++) {
    if (aSumArray[i] < state.targetArray[i]) {
      const diff = state.targetArray[i] - aSumArray[i];
      sumOfSquares += diff * diff;
      count++;
    }
  }
  const meanOfSquares = count > 0 ? sumOfSquares / count : 0;
  const rmsError = Math.sqrt(meanOfSquares);
  return rmsError;
}
async function calcEP(mNo, centerFreq) {
  const measurements = await fetch_mREW();
  const mCount = Object.keys(measurements).length;
  await postNext('Excess phase version', mNo, {
    "include cal": true,
    "append lf tail": false,
    "append hf tail": false,
    "frequency warping": false,
    "replicate data": false
  });
  await postNext('Smooth', mCount + 1, { smoothing: "Psy" });
  const phaseArray = [];
  const epResponse = await fetchSafe('frequency-response', mCount + 1);
  const startFreq = epResponse.startFreq;
  const oct = Math.pow(2, Math.sqrt(2) / 2);
  let k1 = centerFreq / oct, k2 = centerFreq * oct;
  if ('freqStep' in epResponse) {
    const freqStep = epResponse.freqStep;
    k1 = Math.round((k1 - startFreq) / freqStep);
    k2 = Math.round((k2 - startFreq) / freqStep);
  } else if ('ppo' in epResponse) {
    const ppo = epResponse.ppo;
    k1 = Math.round(Math.log2(k1 / startFreq) * ppo);
    k2 = Math.round(Math.log2(k2 / startFreq) * ppo);
  }
  const bytes = Uint8Array.from(atob(epResponse.phase), c => c.charCodeAt(0));
  const buffer = bytes.buffer;
  const data = new DataView(buffer);
  for (let k = k1; k <= k2; k++) {
    const xsPhase = data.getFloat32(k * 4)
    phaseArray.push(xsPhase);
  }
  let sum = phaseArray.reduce((acc, val) => acc + Math.abs(val), 0);
  sum /= (k2 - k1 + 1);
  await postDelete(mCount + 1);
  return sum;
}
async function genSub(freq, i = null) {
  if (i === null) {i = state.nSpeakers * 3};
  await postSafe(`${baseUrl}/${i}/filters`, {
    filters: [{
      "index": 21,
      "type": "Low pass",
      "enabled": true,
      "isAuto": false,
      "frequency": freq,
      "shape": "L-R",
      "slopedBPerOctave": 24
    }]
  }, "Filters set");
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postSafe(`${baseUrl}/${i}/filters`, {
    filters: [{
      "index": 22,
      "type": "None"
    }]
  }, "Filters set");
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postNext('Generate predicted measurement', i);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
}
async function genSpeaker(i, freq) {
  let slope;
  freq === 15.75 ? slope = 6 : slope = 12;
  await postSafe(`${baseUrl}/${i}/filters`, {
    filters: [{
      "index": 21,
      "type": "High pass",
      "enabled": true,
      "isAuto": false,
      "frequency": freq,
      "shape": "BU",
      "slopedBPerOctave": slope
    }]
  }, "Filters set");
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postSafe(`${baseUrl}/${i}/filters`, {
    filters: [{
      "index": 22,
      "type": "None"
    }]
  }, "Filters set");
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postNext('Generate predicted measurement', i);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
}

export { rmsVolume, subIRP, rmsError, calcEP, genSub, genSpeaker };
