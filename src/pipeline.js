import { state } from './state.js';
import { baseUrl, speedDelay, fetch_mREW, postNext, postNext2, postSafe, postDelete, fetchSafe, enableBlock, disableBlock, enableGraph, disableGraph, clearCommands } from './rew-api.js';
import { rmsVolume, genSub, genSpeaker, subIRP } from './signal.js';
import { epAlign } from './alignment.js';
import { aceXO, findXO, tectonic } from './crossover.js';
import { updateAdy } from './filters.js';
import { sortREW } from './calibration.js';
import { endFrequency as endFrequencyDefault, maxBoost } from './config.js';

// endFrequency is a user-tweakable default that the pipeline clamps at runtime,
// so it needs a mutable module-local copy (imported bindings are read-only).
let endFrequency = endFrequencyDefault;

async function checkIfPaused() {
  if (state.isPaused) {
    console.warn("Optimization is paused!");
  }
  while (state.isPaused) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
async function optimizeOCA() {
  clearCommands();
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  disableBlock();
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  enableBlock();
  enableGraph();
  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log("Optimization started...");
  console.warn("Please keep REW on 'SPL & Phase' tab, close any child windows and stay on this web page until optimization is completed!");
  disableGraph();
  const startTime = performance.now();
  document.getElementById('subwooferLPF').disabled = true;
  document.getElementById('forceSmall').disabled = true;
  document.getElementById('forceWeak').disabled = true;
  document.getElementById('forceCentre').disabled = true;
  document.getElementById('forceLarge').disabled = true;
  document.getElementById('noInversion').disabled = true;
  try {
    await sortREW();
    await checkIfPaused();
    await bootUp();
    await checkIfPaused();
    await groundWorks();
    await checkIfPaused();
    await optimizeLevels();
    await checkIfPaused();
    await generateFilters();
    await checkIfPaused();
    await witchCraft();
    await checkIfPaused();
    await aceXO();
    await checkIfPaused();
    await drawResults();
    await checkIfPaused();
    enableGraph();
    disableBlock();
    await updateAdy();
    const endTime = performance.now();
    const totalTime = (endTime - startTime) / 1000;
    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        if (minutes === 0) {
            return `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
        } else if (remainingSeconds === 0) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
        }
    };
    const getCurrentDateTime = () => {
        const now = new Date();
        return now.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };
    console.log(`Congratulations! 'A1 EVO' optimization completed successfully in ${formatTime(totalTime)} on ${getCurrentDateTime()}.`);
    console.info(`*****************************************************************************************************************************************`);
    console.log("When prompted, save the optimized .ady file to your computer and transfer it to your MultEQ Editor app.");
    console.log("Next, transfer ady file 'as is' from MultEQ Editor app to your AV receiver as you normally would after a calibration.");
    console.warn("You should not turn Dynamic EQ on if you didn't measure your speakers with it on in REW and vice versa.")
    console.log("If you are using Dynamic EQ, consider the included program to fix Audyssey's excessive surround boost at lower volumes.");
    console.info("The Editor app graphs will no longer represent before/after speaker responses due to the special filtering technique implemented.");
    console.log("You can save this log to your computer for future reference with mouse right click and by selecting 'Save as'.");
    console.info(`Do not forget to regularly check YT video comments for info on frequent issues and solutions:<a href="https://www.youtube.com/watch?v=lmZ5yV1-wMI" target="_blank">https://www.youtube.com/watch?v=lmZ5yV1-wMI</a>`);
    console.info(`*****************************************************************************************************************************************`);
    console.log("Enjoy your EVO'lved sound!");
  } catch (error) {
    enableGraph();
    disableBlock();
    console.error(`Optimization failed: ${error.message || error}`);
    document.getElementById('startButton').disabled = false;
    document.getElementById('pauseButton').disabled = true;
  }
}
async function bootUp() {
  console.info("Resetting IR windows, EQ target shape and room curve settings for all measurements");
  const measurements = await fetch_mREW();
  const titles = {}; let titleIndices = {};
  let mCount = Object.keys(measurements).length;
  if (!mCount) {
    console.warn(`There are no measurements in REW!`);
    throw new Error (`Please upload your measurements and restart the script.`)
  }
  let baseMessage = "Resetting smoothing, IR windows, EQ target shape and room curve settings for all measurements..."
  for (let q = 1; q <= mCount; q++) {
    await postSafe(`http://localhost:4735/measurements/${q}/ir-windows`, { leftWindowType: "Rectangular", rightWindowType: "Rectangular" }, "Update processed");
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 10));
    await postSafe(`http://localhost:4735/measurements/${q}/target-settings`, { shape: "None" }, "Update processed");
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 10));
    await postSafe(`http://localhost:4735/measurements/${q}/room-curve-settings`, { addRoomCurve: false }, "Update processed");
    await new Promise((resolve) => setTimeout(resolve, speedDelay / 10));
    await postNext('Smooth', q, { smoothing: "None" });
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    console.infoUpdate(`${baseMessage} (${q}/${mCount})`);
  };
  
  await console.infoUpdate("Resetting default equalizer to 'Generic/Generic'...");
  await postSafe(`http://localhost:4735/eq/default-equaliser`, {manufacturer: "Generic", model: "Generic"}, "Default equaliser changed");
  
  const tcResponse = await fetch('http://localhost:4735/eq/house-curve');
  if (tcResponse.ok) {
    const target = await tcResponse.json();
    state.targetCurvePath = target.message;
    if (target && state.targetCurvePath) {
      console.log(`Active custom target curve: ${state.targetCurvePath}`);
    } else {
      console.warn("Target curve not found! Browse to and upload your preferred target curve from 'REW / EQ window / House curve'!");
      throw new Error (`Please re-load your measurements and restart the script.`);
    }
  } else {
    console.warn(`Failed to fetch target curve, please make sure to have started REW API server! HTTP status code: ${tcResponse.status}.`);
    throw new Error(`Failed to retrieve target curve from REW API (HTTP ${tcResponse.status})`);
  };
  const rewVersion = await fetch(`http://localhost:4735/version`);
  if (rewVersion.ok) {
    const rew = await rewVersion.json();
    console.infoUpdate(`Integrity checks completed successfully. Running Room EQ Wizard version ${rew.message}`);
  } else {
      console.error('There seems to be a problem with REW installation!');
      throw new Error(`REW version check failed (HTTP ${rewVersion.status})`);
    };
}
async function groundWorks() {      
  console.info("Calculating average target volume level at the listening position...");
  let indexFL = 0;
  for (let i = 1; i < state.nSpeakers; i++) {
    const mData = await fetch_mREW(i);
    const title = mData.title;
    if (title === "FLo") {indexFL = i; break;}
  }
  const RMS = await postNext('Magn plus phase average', [indexFL, indexFL + 1]);
  const rmsID = parseInt(Object.keys(RMS.results));
  await postNext('Smooth', rmsID, { smoothing: "1/48" });
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postNext('Calculate target level', rmsID);
  state.targetResponse = await fetchSafe('target-level',rmsID);
  state.targetLevel = parseFloat(state.targetResponse);
  console.log(`Calculated average target level: ${state.targetLevel.toFixed(2)}dB`);
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  await postNext('Generate target measurement', rmsID);
  await postDelete(rmsID);
  let indices = Array.from({ length: state.nSpeakers - 1 }, (_, i) => i + 1);
  indices.push(state.nSpeakers + state.numSub);
  const volShift = await postNext('Align SPL', indices, {"frequencyHz": "1600","spanOctaves": "5","targetdB": "average"});
  const volDelta = parseFloat(volShift.results[state.nSpeakers + state.numSub].alignSPLOffsetdB);
  //console.log(volDelta);
  let alignments = [];
  indices.forEach(index => {
    const offsetDB = volShift.results[index]?.alignSPLOffsetdB;
    const netMove = parseFloat(offsetDB) - parseFloat(volDelta);
    //console.log(`Index ${index}: alignSPLOffsetdB = ${netMove}`);
    alignments.push(netMove);
  });
  alignments.pop();
  const roundToNearestHalf = (num) => Math.round(num * 2) / 2;
  let bestDeduction = 0;
  let minTotalAbsError = Infinity;
  let minTotalDifference = Infinity;
  let bestAdjustments = [];
  const roundToPrecision = (num, precision = 10) => {
      return Math.round(num * Math.pow(10, precision)) / Math.pow(10, precision);
  };
  const tolerance = 1e-6;
  for (let i = 0; i < alignments.length; i++) {
      const deduction = alignments[i];
      let currentAdjustments = alignments.map(a => a - deduction);
      let appliedAdjustments = currentAdjustments.map(adj => roundToNearestHalf(adj));
      appliedAdjustments[i] = 0;
      const errors = currentAdjustments.map((adj, idx) => adj - appliedAdjustments[idx]);
      let totalAbsError = errors.reduce((sum, error) => sum + Math.abs(error), 0);
      let totalDifference = errors.reduce((sum, error) => sum + error, 0);
      totalAbsError = roundToPrecision(totalAbsError, 6);
      totalDifference = roundToPrecision(Math.abs(totalDifference), 6);
      if (totalAbsError < minTotalAbsError ||
          (roundToPrecision(totalAbsError, 6) === roundToPrecision(minTotalAbsError, 6) && totalDifference < minTotalDifference) ||
          (roundToPrecision(totalAbsError, 6) === roundToPrecision(minTotalAbsError, 6) && roundToPrecision(totalDifference, 6) === roundToPrecision(minTotalDifference, 6) && deduction < bestDeduction)) {
          minTotalAbsError = totalAbsError;
          minTotalDifference = totalDifference;
          bestDeduction = deduction;
          bestAdjustments = appliedAdjustments;
      }
      /*console.log(`Deduct ${i + 1}:`);
      console.log("indice required_adjustment deduct applied_adj error");
      currentAdjustments.forEach((adj, idx) => {
          console.log(`${idx + 1}\t${alignments[idx].toFixed(2)}\t${adj.toFixed(2)}\t${appliedAdjustments[idx].toFixed(2)}\t${errors[idx].toFixed(2)}`);
      });
      console.log(`Total Absolute Error: ${totalAbsError.toFixed(2)}`);
      console.log(`Total Difference: ${totalDifference.toFixed(2)}\n`);*/
  }
  //console.log(bestDeduction, bestAdjustments, minTotalAbsError, minTotalDifference);
  for (let i = 1; i <= bestAdjustments.length; i++) {
      state.customLevel[i] = bestAdjustments[i - 1];
      const offsetValue = bestAdjustments[i - 1] - alignments[i - 1] - volDelta;
      await postNext('Add SPL offset', i, { offset: offsetValue });
      //console.log(i, offsetValue);
  }
  const targetBack = - volDelta - bestDeduction;
  await postNext('Add SPL offset', rmsID, { offset: targetBack });
  await postDelete(rmsID);
  state.targetLevel -= bestDeduction;
  console.log(`New target level optimized for minimum total speaker volume deviation: ${state.targetLevel.toFixed(2)}dB`);
  console.infoUpdate("Performing precision temporal alignment across the speaker array for optimal coherence...");
  const oIndices = Array.from({ length: state.nSpeakers + state.numSub - 1 }, (_, j) => j + 1);
  await epAlign(oIndices, true);
  const measurements = await fetch_mREW();
  for (let i = 1; i <= state.nSpeakers + state.numSub - 1; i++) {
    state.mSec[i] = parseFloat(measurements[i].cumulativeIRShiftSeconds);
  }
  console.infoUpdate(`Proprietary 'filtered excess phase' based impulse alignment optimization is complete!`);
  const minM = Math.min(...state.mSec.slice(1, state.nSpeakers));
  const maxM = Math.max(...state.mSec.slice(1, state.nSpeakers));
  const limInsec = 6.00049999 / state.sOs;
  state.msecMin = maxM - limInsec;
  state.msecMax = minM + limInsec;
  for (let i = state.nSpeakers; i <= state.nSpeakers + state.numSub - 1; i++) {
      const overDelay = state.mSec[i] - state.msecMax;
      state.mSec[i] -= overDelay;
      await postNext2('Offset t=0', i, {offset: -overDelay, unit: "seconds"});
  };
  if (state.numSub > 1) {
    console.warn("Your system will now be converted to 'standard bass' mode for a better sound experience...");
    await tectonic();
    console.warn("Time and volume aLignment of subwoofers between each other in 'standard bass' mode completed.")
  } else {
    state.maxNegative = (state.msecMin - state.mSec[state.nSpeakers]) * 1000;
    state.maxPositive = 0;
  }
  (state.noDistance ? console.info(`No distance value was found for speaker ${state.commandId[1]} in the calibration file and it's been temporarily set to ${state.cDist} meters.`)
    : console.info(`Speaker ${state.commandId[1]} distance has been set to ${state.cDist.toFixed(2)} meters (adjusted for your receiver's internal speed of sound setting).`))
  console.log(`Available bass system volume adjustment range → { ${state.subLO}dB : ${state.subHI}dB }`);
  console.log(`Total 'delay headroom' available to subwoofer after maxing out all tweaks → ${-state.maxNegative}ms`);
  if (state.maxNegative > 0) {
    console.warn(`The distances/delays between your speakers/sub(s) are above the hardware limit of 6m by defualt!`);
    console.error(`It's technically not possible to correctly time align them. Optimization cannot continue!`)
    throw new Error("Speaker/subwoofer distances exceed the 6m hardware limit — time alignment is not possible");
  }
}
async function optimizeLevels() {
  for (let i = 1; i < state.nSpeakers; i++) {
    if (state.customLevel[i] > 12) { state.customLevel[i] = 12; console.warn(`${state.commandId[i]} required volume adjustment above hardware limits and is maxed out!`) }
    if (state.customLevel[i] < -12) { state.customLevel[i] = -12; console.warn(`${state.commandId[i]} required volume adjustment below hardware limits and is set as low as possible!`) }
    console.log(`${state.commandId[i]} - applied adjustment: ${state.customLevel[i]}dB`);
  }
  if (state.numSub === 1) {state.customLevel[state.nSpeakers] = 0;}
  const subOffset = await rmsVolume(state.nSpeakers);
  for (let i = state.nSpeakers; i < (state.nSpeakers + state.numSub); i++) {
    state.customLevel[i] += subOffset;
    if (state.customLevel[i] < -12) {console.warn(`SW${i - state.nSpeakers + 1} volume is too high and can only be decreased by -12dB (hardware limit). Optimization will not be optimal!`); state.customLevel[i] = -12;};
    if (state.customLevel[i] > 12) {console.warn(`SW${i - state.nSpeakers + 1} volume is too low and can only be increased by +12dB (hardware limit). Optimization will not be optimal!`); state.customLevel[i] = 12;};
  }
}
async function generateFilters() {
  console.info(`Generating proprietary room correction filters based on Hilbert transforms of the impulse responses...`);
  for (let i = 1; i <= state.nSpeakers; i++) {
    await postSafe(`http://localhost:4735/measurements/${i}/target-settings`, { shape: "None" }, "Update processed");
    await postSafe(`http://localhost:4735/measurements/${i}/room-curve-settings`, { addRoomCurve: false }, "Update processed");
    await postNext('Minimum phase version', i, {
      "include cal": true,
      "append lf tail": false,
      "append hf tail": false,
      "frequency warping": false,
      "replicate data": true
    });
  };
  await postSafe(`http://localhost:4735/eq/house-curve`, state.targetCurvePath, "House curve set");
  await postSafe(`http://localhost:4735/eq/match-target-settings`, {
    startFrequency: 10,
    endFrequency: endFrequency,
    individualMaxBoostdB: maxBoost,
    overallMaxBoostdB: 0,
    flatnessTargetdB: 1,
    allowNarrowFiltersBelow200Hz: true,
    varyQAbove200Hz: false,
    allowLowShelf: false,
    allowHighShelf: false
  }, "Update processed");
  await new Promise((resolve) => setTimeout(resolve, speedDelay));
  for (let i = state.nSpeakers + 1; i <= state.nSpeakers * 2; i++) {
    await fetchSafe('target-level', i,state.targetLevel);
    let smoothing;
    if (endFrequency > 1000) (endFrequency = 1000);
    endFrequency > 282 ? smoothing = "Var" : smoothing = "None";
    await postNext('Smooth', i, { smoothing: smoothing });
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    await postNext('Match target', i);
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    const mFilter = await postNext('Generate filters measurement', i);
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    let fIndex2 = Object.keys(mFilter.results);
    const fIndex1 = (parseInt(fIndex2) - state.nSpeakers * 2) / 2 + 0.5;
    let { "New measurement": fName } = mFilter.results[fIndex2];
    fName = fName.slice(8, -4) + "final";
    fIndex2 = parseInt(fIndex2);
    await postNext('Arithmetic', [fIndex1, fIndex2], { function: "A * B" });
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    await fetch_mREW(fIndex2 + 1, 'PUT', { title: fName });
  }
  for (let i = state.nSpeakers * 2; i > state.nSpeakers; i--) {
    await postDelete(i);
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
  }
  for (let i = state.nSpeakers + 1; i < state.nSpeakers * 3; i += 2) {
    const id = (i - state.nSpeakers) / 2 + 0.5;
    await fetch_mREW(i, 'PUT', { title: state.commandId[id] });
  }
  const subResponse = await fetchSafe('frequency-response', state.nSpeakers * 3);
  const startFreq2 = subResponse.startFreq;
  const freqStep2 = subResponse.freqStep;
  const bytesSub = Uint8Array.from(atob(subResponse.magnitude), c => c.charCodeAt(0));
  const bufferSub = bytesSub.buffer;
  const dataSub = new DataView(bufferSub);
  let k = Math.round((11 - startFreq2) / freqStep2), subMagnitude = -Infinity;
  while (subMagnitude <state.targetLevel) {
    if (startFreq2 + (k - 1) * freqStep2 > 100) {break;}
    subMagnitude = dataSub.getFloat32(k * 4); k++;
  }
  const subFlat = (startFreq2 + (k - 1) * freqStep2).toFixed(2);
  if (Number(subFlat) < 100) {
    const pm = (freqStep2 / 2).toFixed(2)
    console.log(`Your bass management system is expected to measure flat down to {${subFlat} \u00B1 ${pm}} Hz!`);
  } else {console.warn("There was a problem calculating your subwoofer bass extension, please check your measurements!")}
}
async function witchCraft() {   
  while (true) {
    try {
      const response = await fetch(`http://localhost:4735/eq/house-curve`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) { throw new Error('Network response was not OK!'); }
      const data = await response.json();
      if (data.message === "House curve cleared") { break; }
      else { await new Promise(resolve => setTimeout(resolve, speedDelay)); }
    }
    catch (error) {
      throw new Error(`Error clearing house curve: ${error.message || error}`);
    }
  }
  await fetchSafe('target-level', 1,state.targetLevel);
  await postNext('Generate target measurement', 1);
  await postNext('Minimum phase version', state.nSpeakers * 3 + 1, {
    "include cal": false,
    "append lf tail": false,
    "append hf tail": false,
    "frequency warping": false,
    "replicate data": true
  });
  await postNext('Smooth', state.nSpeakers * 3 + 2, { smoothing: "None" });
  await postDelete(state.nSpeakers * 3 + 1);
  console.log("Calculating 'steady state' roll off frequencies based on 12dB/octave Butterworth highpass filter slopes (receiver spec.)...");
  for (let j = 0; j < state.freqLength; j++) {
    await genSpeaker(state.nSpeakers * 3 + 1, state.freqIndex[j]);
  };
  const snap = await fetch_mREW();
  const mCount = Object.keys(snap).length;
  let j = 1;
  for (let i = state.nSpeakers + 2; i <= state.nSpeakers * 3 - 2; i += 2) {
    const iXO = await findXO(i, mCount);
    state.customCrossover[j] = state.freqIndex[iXO - state.nSpeakers * 3 - 2];
    j++;
  };
  for (let i = 1; i < state.nSpeakers; i++) {
    state.customCrossover[i] === 15.75 ? console.info(`Speaker ${state.commandId[i]}: 'Large/Full range'`) : console.info(`Speaker ${state.commandId[i]}: ${state.customCrossover[i]}Hz`);
  }
  for (let i = mCount; i > state.nSpeakers * 3; i--) {
    await postDelete(i);
  }
  console.log("Calculated subwoofer natural lowpass filter roll off frequency:")
  let rollSub;
  for (let i = 0; i < state.numSub; i++) {
    state.subLPF[i] = await subIRP(state.nSpeakers + i)
    state.subLPF[i] ? rollSub = 120 : rollSub = 250;
    rollSub === 120 ? console.warn(`SW${i + 1}: ${rollSub}Hz  - set 'LPF for LFE' to 250Hz in the AVR for better LFE channel output! Sub is also not suitable for speaker crossovers above 120Hz`) : console.log(`SW${i + 1}: ${rollSub}Hz`);
  };
}
async function drawResults() {
  await postSafe(`http://localhost:4735/eq/house-curve`, state.targetCurvePath, "House curve set");
  console.info("Optimizing EQ filters and generating expected final outputs in REW for each channel...");
  let k = 0;
  for (let i = 1; i < state.nSpeakers; i++) {
    let xo = state.customCrossover[i];
    if (xo != "L") {
      await genSpeaker(i, xo);
      await genSub(xo);
    }
    else if (xo === "L") {
      await postSafe(`http://localhost:4735/measurements/${i}/command`, {command: "Response copy"}, "Completed");
      if (state.lfePlusMain) {
        await genSub(state.bassExtractionLPF);
      }
      else {
        await postSafe(`${baseUrl}/${state.nSpeakers + 1}/filters`, {
          filters: [{
            "index": 1,
            "type": "None"
          }]
        }, "Filters set");
        await new Promise((resolve) => setTimeout(resolve, speedDelay));
        await postNext('Generate filters measurement', state.nSpeakers + 1);
        await new Promise((resolve) => setTimeout(resolve, speedDelay));
      }
    };
    await postNext('Arithmetic', [state.nSpeakers * 3 + 2 + k, state.nSpeakers * 3 + 3 + k], { function: "A + B" });
    await postNext('Minimum phase version', state.nSpeakers * 3 + 4 + k, {
      "include cal": true,
      "append lf tail": false,
      "append hf tail": false,
      "frequency warping": false,
      "replicate data": true
    });
    await postSafe(`http://localhost:4735/eq/match-target-settings`, {
      startFrequency: 10,
      endFrequency: endFrequency,
      individualMaxBoostdB: maxBoost,
      overallMaxBoostdB: 0,
      flatnessTargetdB: 1,
      allowNarrowFiltersBelow200Hz: true,
      varyQAbove200Hz: false,
      allowLowShelf: false,
      allowHighShelf: false
    }, "Update processed");
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    await fetchSafe('target-level', state.nSpeakers * 3 + 5 + k,state.targetLevel);
    let smoothing;
    endFrequency > 282 ? smoothing = "Var" : smoothing = "None";
    await postNext('Smooth', state.nSpeakers * 3 + 5 + k, { smoothing: smoothing });
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    await postNext('Match target', state.nSpeakers * 3 + 5 + k);
    await new Promise((resolve) => setTimeout(resolve, speedDelay));
    await postNext('Generate filters measurement', state.nSpeakers * 3 + 5 + k);
    await new Promise((resolve) => setTimeout(resolve, speedDelay)); 
    await postNext('Generate predicted measurement', state.nSpeakers * 3 + 5 + k);
    await fetch_mREW(state.nSpeakers * 3 + 6 + k, 'PUT', {title: state.commandId[i]});
    const title = state.commandId[i] + "channel";
    await fetch_mREW(state.nSpeakers * 3 + 7 + k, 'PUT', {title: title});
    await postNext('Smooth', state.nSpeakers * 3 + 7 + k, {smoothing: "Var"});
    await postDelete(state.nSpeakers * 3 + 5 + k);
    await postDelete(state.nSpeakers * 3 + 4 + k);
    await postDelete(state.nSpeakers * 3 + 3 + k);
    await postDelete(state.nSpeakers * 3 + 2 + k);
    k += 2;
  }; 
  for (let i = state.nSpeakers * 3 - 2; i > state.nSpeakers; i--) {
    await postDelete(i);
  };
  const mData = await fetch_mREW(state.nSpeakers + 1);
  const title = mData.title;
  await postSafe(`http://localhost:4735/measurements/${state.nSpeakers + 1}/command`, {command: "Response copy"}, "Completed");
  await fetch_mREW(state.nSpeakers * 3 + 2, 'PUT', {title: title});
  await postDelete(state.nSpeakers + 1);
  let targetName = state.targetCurvePath.split('\\').pop().split('.').slice(0, -1).join('.');
  targetName += ` @ ${state.targetLevel}dB`;
  await fetch_mREW(state.nSpeakers + 2, 'PUT', { title: targetName });
  state.subLPF[0] ? await genSub(250, state.nSpeakers + 1) : await genSub(120, state.nSpeakers + 1);
  await fetch_mREW(state.nSpeakers * 3 + 2, 'PUT', {title: "LFEchannel"});
  await postNext('Smooth', state.nSpeakers * 3 + 2, {smoothing: "Var"});
}

export { checkIfPaused, optimizeOCA, bootUp, groundWorks, optimizeLevels, generateFilters, witchCraft, drawResults };
