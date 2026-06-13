import { state } from './state.js';
import { baseUrl, speedDelay, fetch_mREW, postNext, postSafe, fetchSafe, postAlign, fetchAlign } from './rew-api.js';
import { calcEP } from './signal.js';

async function alignCenter() {
  let normDev = Infinity, centerDelay, centerInv, centerPossible = false;
  console.log(`Subwoofer(s) will now be aligned to 'Center' speaker...`);
  let indexC = 0;
  for (let i = state.nSpeakers + 2; i < state.nSpeakers * 3 - 2; i += 2) {
    const mData = await fetch_mREW(i);
    const title = mData.title;
    if (title === "Cfinal") {indexC = i; break;}
  }
  if (indexC != 0) {
    xo = state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "C")];
    let firstIndex = state.freqIndex.indexOf(xo);
    let lastIndex = state.freqIndex.indexOf(xo);
    if (firstIndex > 0) {firstIndex--;}
    if (lastIndex < state.freqLength - 1) {lastIndex++;}
    let minSum = Infinity;
    if (firstIndex === 0) {
      frontLFE = await rmsError(indexC);
      console.info(`Analysing 'Center' speaker in 'Subwoofer Mode: LFE' setting:`);
      console.info(`Expected dip removal efficiency: ${(100 - frontLFE).toFixed(2)}%`);
      firstIndex ++;
    }
    console.info("Analysis of Center speaker set as 'Small':");
    const tempFI= firstIndex, tempLI = lastIndex;
    const range = perSpeakerXOSearchRange["C"] || [];
    if (range.length === 1) {
      firstIndex = state.freqIndex.indexOf(range[0]);
      lastIndex = firstIndex;
      if (firstIndex < 1) {
        console.error(`Custom setting '${range[0]}' is not a valid crossover frequency for Centre speaker!`);
        console.warn("Skipping custom crossover settings and returning to default values...");
        firstIndex = tempFI; lastIndex = tempLI;
      };
    }
    if (range.length >= 2) {
      firstIndex = state.freqIndex.indexOf(range[0]);
      lastIndex = state.freqIndex.indexOf(range[1]);
      if (firstIndex < 0 || lastIndex < 0 || range.length > 2) {
        console.error(`Please check your customized crossover search frequency range settings for the Center speaker!`);
        console.warn("Skipping custom crossover settings and returning to default values...");
        firstIndex = tempFI; lastIndex = tempLI;
      }
      if (lastIndex < firstIndex) {lastIndex = firstIndex;}
    }
    for (let i = firstIndex; i <= lastIndex; i++) {
      await genSpeaker(indexC, state.freqIndex[i]);
      await genSub(state.freqIndex[i]);
      ({isPossible, requiredDelay, isInverted, excessPhase} = await align4impulse(state.nSpeakers * 3 + 2, state.nSpeakers * 3 + 3));
      if (!isPossible) {
          console.info(`Crossover frequency: ${state.freqIndex[i]}Hz, alignment not possible within delay limits!`);
      } else {
          centerPossible = true;
          state.noInversion 
              ? console.info(`Crossover frequency: ${state.freqIndex[i]}Hz, required delay: ${-requiredDelay.toFixed(2)}ms, expected dip removal efficiency: ${(100 - excessPhase).toFixed(2)}%`)
              : console.info(`Crossover frequency: ${state.freqIndex[i]}Hz, required delay: ${-requiredDelay.toFixed(2)}ms (subwoofer polarity inverted) , expected dip removal efficiency: ${(100 - excessPhase).toFixed(2)}%`);
          if (excessPhase < normDev) {
              normDev = excessPhase;
              normXO = state.freqIndex[i];
              centerDelay = requiredDelay;
              centerInv = isInverted;
          }
      };
      await postDelete(state.nSpeakers * 3 + 3);
      await postDelete(state.nSpeakers * 3 + 2);
    };
    if (centerPossible) {
      console.log(`Selected crossover frequency for Center speaker: ${normXO}Hz, expected dip removal efficieny: ${(100 - normDev).toFixed(2)}%`)
      state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "C")] = normXO;
      return {centerInv, centerDelay};
    } else {return false;}

  } else {return false;};
}
async function alignSurrounds() {
}
async function epAlign(indices, final) {
  const epIndices = [], epShifts = [];
  for (let j = 0; j < indices.length; j++) {
    const index = indices[j];
    await postNext('Smooth', index, { smoothing: "None" });
    await postSafe(`http://localhost:4735/measurements/${index}/target-settings`, { shape: "None" }, "Update processed");
    await postSafe(`http://localhost:4735/measurements/${index}/room-curve-settings`, { addRoomCurve: false }, "Update processed");
    const epImpulse = await postNext2('Excess phase version', index, {
      "include cal": true,
      "append lf tail": false,
      "append hf tail": false,
      "frequency warping": false,
      "replicate data": false
    });
    epIndices.push(Object.keys(epImpulse.results)[0]);
    const key = parseInt(epIndices[j]);
    const name = epImpulse.results[key]["New measurement"];
    if (name.includes("SW")) {
      await postSafe(`${baseUrl}/${key}/filters`, {
        filters: [{
          "index": 21,
          "type": "Low pass",
          "enabled": true,
          "isAuto": false,
          "frequency": 50,
          "shape": "BU",
          "slopedBPerOctave": 12
        }]
      }, "Filters set");
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      await postSafe(`${baseUrl}/${key}/filters`, {
        filters: [{
          "index": 22,
          "type": "High pass",
          "enabled": true,
          "isAuto": false,
          "frequency": 50,
          "shape": "BU",
          "slopedBPerOctave": 12
        }]
      }, "Filters set");
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      await postSafe(`http://localhost:4735/measurements/${key}/target-settings`, { shape: "None" }, "Update processed");
      await postSafe(`http://localhost:4735/measurements/${key}/room-curve-settings`, { addRoomCurve: false }, "Update processed");
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      await postNext('Generate predicted measurement', key);
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      await postDelete(key);
    } else {
      await postSafe(`${baseUrl}/${key}/filters`, {
        filters: [{
          "index": 21,
          "type": "High pass",
          "enabled": true,
          "isAuto": false,
          "frequency": 5000,
          "shape": "BU",
          "slopedBPerOctave": 12
        }]
      }, "Filters set");
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      await postSafe(`${baseUrl}/${key}/filters`, {
        filters: [{
          "index": 22,
          "type": "Low pass",
          "enabled": true,
          "isAuto": false,
          "frequency": 5000,
          "shape": "BU",
          "slopedBPerOctave": 12
        }]
      }, "Filters set");
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      await postSafe(`http://localhost:4735/measurements/${key}/target-settings`, { shape: "None" }, "Update processed");
      await postSafe(`http://localhost:4735/measurements/${key}/room-curve-settings`, { addRoomCurve: false }, "Update processed");
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      await postNext('Generate predicted measurement', key);
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
      await postDelete(key);
      await new Promise((resolve) => setTimeout(resolve, speedDelay));
    }
  }
  await postNext('Remove IR delays', epIndices);
  const sansSubs = epIndices.slice(0, -state.numSub);
  if (final) {await postNext('Cross corr align', sansSubs)} else {await postNext('Cross corr align', epIndices)}
  
  for (let j = 0; j < epIndices.length; j++) {
    const epShift = await fetch_mREW(epIndices[j]);
    epShifts[j] = parseFloat(epShift.cumulativeIRShiftSeconds);
  }

  let minShiftPeak = Infinity, maxShiftPeak = -Infinity;
  let minShiftStart = Infinity, maxShiftStart = -Infinity;
  
  if (!final) {
    for (let j = 0; j < epIndices.length; j++) {
      const epResult = await fetch_mREW(epIndices[j]);
      const shiftPeak = parseFloat(epResult.timeOfIRPeakSeconds);
      const shiftStart = parseFloat(epResult.timeOfIRStartSeconds);
      minShiftPeak = Math.min(minShiftPeak, shiftPeak);
      maxShiftPeak = Math.max(maxShiftPeak, shiftPeak);
      minShiftStart = Math.min(minShiftStart, shiftStart);
      maxShiftStart = Math.max(maxShiftStart, shiftStart);
    };
    
  } else {
      for (let j = 0; j < sansSubs.length; j++) {
        const epResult = await fetch_mREW(sansSubs[j]);
        const shiftPeak = parseFloat(epResult.timeOfIRPeakSeconds);
        const shiftStart = parseFloat(epResult.timeOfIRStartSeconds);
        minShiftPeak = Math.min(minShiftPeak, shiftPeak);
        maxShiftPeak = Math.max(maxShiftPeak, shiftPeak);
        minShiftStart = Math.min(minShiftStart, shiftStart);
        maxShiftStart = Math.max(maxShiftStart, shiftStart);
      };
  };
  const usePeak = Math.abs(maxShiftPeak - minShiftPeak) < Math.abs(maxShiftStart - minShiftStart);
  for (let j = 0; j < epIndices.length; j++) {
    const {timeOfIRPeakSeconds, timeOfIRStartSeconds} = await fetch_mREW(epIndices[j]);
    const shift = (usePeak ? parseFloat(timeOfIRPeakSeconds) : parseFloat(timeOfIRStartSeconds)) + epShifts[j];
    await postNext2('Offset t=0', indices[j], {offset: shift, unit: "seconds"});
  }
  for (let j = epIndices.length - 1; j >= 0; j--) {
    await postDelete(epIndices[j]);
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
  }
  return;
}
async function align4impulse(ind1, ind2) {
  let isInverted = false, isPossible = false, requiredDelay = NaN, excessPhase = Infinity, bestFreq = NaN, checkFreq;
  let loDelay = state.maxNegative;
  let hiDelay = state.maxPositive;
  let tempLo = 0; let tempHi = 0;
  const maxDelay = 6.00049999 / state.sOs * 1000;
  if (loDelay < -maxDelay) {loDelay = -maxDelay;}
  if (hiDelay > maxDelay) {hiDelay = maxDelay;}
  if (loDelay > 0) { tempLo = loDelay; loDelay = 0; }
  if (hiDelay < 0) { tempHi = hiDelay; hiDelay = 0; }
  await postSafe("http://localhost:4735/alignment-tool/index-a", ind1, "selected as measurement A");
  await postSafe("http://localhost:4735/alignment-tool/index-b", ind2, "selected as measurement B");
  await postAlign('Reset all');
  await postSafe("http://localhost:4735/alignment-tool/mode", "Impulse", "Mode set");
  await postSafe("http://localhost:4735/alignment-tool/max-negative-delay", -hiDelay, "Maximum negative delay set to");
  await postSafe("http://localhost:4735/alignment-tool/max-positive-delay", -loDelay, "Maximum positive delay set to");
  console.info("Deep searching alignment options...")
  for (checkFreq = 20; checkFreq <= 250; checkFreq++) {
    const postAlignResult = await postAlign('Align IRs', checkFreq);
    if (postAlignResult.message === 'Delay too large' && state.previousDelay != postAlignResult.delay) {
      console.infoUpdate(`Skipping possible alignment at ${checkFreq}Hz - required delay is outside limits: ${-postAlignResult.delay}ms`);
      state.previousDelay = postAlignResult.delay;
      continue;
    }
    isInverted = await fetchAlign('invert-b');
    if (state.noInversion && isInverted) {
      isPossible = false;
      continue;
    };
    const delayB = await fetchAlign('delay-b');
    requiredDelay = -parseFloat(delayB);
    if ((tempLo > 0 && requiredDelay < tempLo) || (tempHi < 0 && requiredDelay > tempHi)) {continue;}
    isPossible = true;
    const freqResponse = await fetchAlign('aligned-frequency-response?smoothing=1%2F48&ppo=96');
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
    if (rmsError < excessPhase) {
      excessPhase = rmsError;
      bestFreq = checkFreq;
    }
  }
  if (isPossible) {
    const postAlignResult = await postAlign('Align IRs', bestFreq);
    const delayB = await fetchAlign('delay-b');
    requiredDelay = -parseFloat(delayB);
    isInverted = await fetchAlign('invert-b');
  }
  return {isPossible, requiredDelay, isInverted, excessPhase};
}
async function alignMsub(ind1, ind2, loDelay, hiDelay) {
  let isInverted = false, isPossibleI = false, requiredDelayI = NaN, sumIndex = null, samples;
  await postSafe("http://localhost:4735/alignment-tool/index-a", ind1, "selected as measurement A");
  await postSafe("http://localhost:4735/alignment-tool/index-b", ind2, "selected as measurement B");
  await postAlign('Reset all');
  await postSafe("http://localhost:4735/alignment-tool/mode", "Impulse", "Mode set");
  await postSafe("http://localhost:4735/alignment-tool/max-negative-delay", loDelay, "Maximum negative delay set to");
  await postSafe("http://localhost:4735/alignment-tool/max-positive-delay", hiDelay, "Maximum positive delay set to");
  let magSum, maxSum = -Infinity, bestFreq = NaN;
  console.info("Commencing in-depth frequency and SPL analysis...")
  for (checkFreq = 20; checkFreq <= 250; checkFreq++) {
    magSum = 0;
    const postAlignResult = await postAlign('Align IRs', checkFreq);
    if (postAlignResult.message === 'Delay too large' && state.previousDelay != postAlignResult.delay) {
      console.infoUpdate(`Skipping possible alignment @ ${checkFreq}Hz - required delay is outside limits: ${-postAlignResult.delay}ms`);
      state.previousDelay = postAlignResult.delay;
      continue;
    }
    isInverted = await fetchAlign('invert-b');
    if (state.noInversion && isInverted) {
      isPossibleI = false;
      continue;
    };
    isPossibleI = true;
    const tempSum = await fetchAlign('aligned-frequency-response');
    let startFreq = tempSum.startFreq;
    let k1 = 30, k2 = 80;
    if ('freqStep' in tempSum) {
      let freqStep = tempSum.freqStep;
      k1 = Math.round((k1 - startFreq) / freqStep);
      k2 = Math.round((k2 - startFreq) / freqStep);
    } else if ('ppo' in tempSum) {
      const ppo = tempSum.ppo;
      k1 = Math.round(Math.log2(k1 / startFreq) * ppo);
      k2 = Math.round(Math.log2(k2 / startFreq) * ppo);
    };
    samples = k2 - k1 + 1;
    const bytes = Uint8Array.from(atob(tempSum.magnitude), c => c.charCodeAt(0));
    const buffer = bytes.buffer;
    const data = new DataView(buffer);
    for (let k = k1; k <= k2; k++) {
      const sumMagnitude = data.getFloat32(k * 4);
      magSum += sumMagnitude;
    }
    if (magSum > maxSum) {
      maxSum = magSum;
      bestFreq = checkFreq;
    }
  }
  if (isPossibleI) {
    const postAlignResult = await postAlign('Align IRs', bestFreq);
    const delayB = await fetchAlign('delay-b');
    requiredDelayI = -parseFloat(delayB);
    isInverted = await fetchAlign('invert-b');
    console.info(`Optimal alignment: @${bestFreq}Hz, ${maxSum / samples}dB, isInverted: ${isInverted}, required delay: ${(-1 * requiredDelayI).toFixed(2)}ms`);
    const measurements = await fetch_mREW();
    const mCount = Object.keys(measurements).length;
    const alignedSum = await postAlign('Aligned sum');
    const parsed = JSON.parse(alignedSum.message);
    let key = Object.keys(parsed.results)[0];
    sumIndex = parseInt(key);
  }
  return { isPossibleI, requiredDelayI, isInverted, sumIndex };
}

export { alignCenter, alignSurrounds, epAlign, align4impulse, alignMsub };
