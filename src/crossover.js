import { state } from './state.js';
import { fetch_mREW, postNext, postSafe, postDelete, fetchSafe } from './rew-api.js';
import { genSub, rmsError, genSpeaker, rmsVolume, calcEP } from './signal.js';
import { alignCenter, align4impulse, alignMsub } from './alignment.js';
import { perSpeakerXOSearchRange } from './config.js';

// These were implicit globals shared across one scope in the original monolith.
// Declared at module scope here so the same cross-function sharing is preserved
// under ES-module strict mode.
let startFreq, k1, k2, ppo, freqStep, oCount, i, minXO, maxXO, xo, pairName;
let isPossible, requiredDelay, isInverted, excessPhase;

async function aceXO() {
  let subMoves = 0, inversion = false, lmDev = Infinity, lmXO, lmDelay = 0, lmInv = false, normDev = Infinity, normXO , normDelay = 0, normInv = false, frontLFE = Infinity, centerAligned = false;
  await postSafe(`http://localhost:4735/eq/house-curve`, state.targetCurvePath, "House curve set");
  await fetchSafe('target-level', 1, state.targetLevel);
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
  state.targetArray = [];
  const targetResponse = await fetchSafe('frequency-response?smoothing=1%2F48&ppo=96', state.nSpeakers * 3 + 1);
  startFreq = state.targetResponse.startFreq;
  k1 = 20;
  k2 = 250;
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
  let indexFL = 0;
  for (let i = state.nSpeakers + 2; i < state.nSpeakers * 3 - 2; i += 2) {
    const mData = await fetch_mREW(i);
    const title = mData.title;
    if (title === "FLfinal") {indexFL = i; break;}
  }
  await postNext('Vector average', [indexFL, indexFL + 2]);
  if (indexFL === 0) {console.error("Optimization cannot continue without 'Front' speakers!"); throw new Error("Optimization cannot continue without 'Front' speakers!");}
  let firstIndex, lastIndex;
  if (!state.forceWeak) {
    let minXO = Math.min(state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FL")], state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FR")]);
    let maxXO = Math.max(state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FL")], state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FR")]);
    firstIndex = state.freqIndex.indexOf(minXO);
    lastIndex = state.freqIndex.indexOf(maxXO);
    if (firstIndex === lastIndex) {
      if (firstIndex <= 1) {firstIndex = 0;}
      if (lastIndex <= 3) {lastIndex = 4;} else if (lastIndex < 7) {lastIndex = 7;}
    } else {
        if (lastIndex <= 3) {lastIndex = 4;} else if (lastIndex < 7) {lastIndex = 7;}
    };
    if (firstIndex === 8) {firstIndex--};
    if (firstIndex === 0 || state.forceLarge) {
      frontLFE = await rmsError(state.nSpeakers * 3 + 2);
      console.info(`Analysing 'Large / Full range' front main speakers in 'Subwoofer Mode: LFE' setting:`);
      console.info(`Expected dip removal efficiency: ${(100 - frontLFE).toFixed(2)}%`);
      ({lmDev, lmXO, lmDelay, lmInv} = await largeSpeakers(state.nSpeakers * 3 + 2));
      state.solution ? console.info(`Large / Full range speakers 'LFE + Main' mode, subwoofer lpf: ${lmXO}Hz, expected dip removal efficiency: ${(100 - lmDev).toFixed(2)}%`) : console.info(`Large / Full range speakers 'LFE + Main' mode, no solutions found!`);
      firstIndex ++;
    } else {console.info(`'Large / Full range' analysis for 'Front' speakers skipped (not large enough)!`);}
  }
  console.info("Analysis of Front mains set as 'Small' speakers:");
  if (state.forceWeak) {firstIndex = 3; lastIndex = 3;}
  let range = perSpeakerXOSearchRange["FL"] || [];
  if (range.length === 1 && !state.forceLarge) {
    firstIndex = state.freqIndex.indexOf(range[0]);
    lastIndex = firstIndex;
    if (firstIndex < 0) {
      throw new Error(`Custom setting '${range[0]}' is not a valid crossover frequency!`);
    };
    frontLFE = Infinity; lmDev = Infinity;
  }
  if (range.length >= 2 && !state.forceLarge) {
    firstIndex = state.freqIndex.indexOf(range[0]);
    lastIndex = state.freqIndex.indexOf(range[1]);
    if (firstIndex < 0 || lastIndex < 0 || range.length > 2) {
      throw new Error(`Please check your customized crossover search frequency range settings for speaker ${pairName}!`);
    }
    if (lastIndex < firstIndex) {lastIndex = firstIndex;}
    frontLFE = Infinity; lmDev = Infinity;
  };
  let smallPossible = false;
  for (let i = firstIndex; i <= lastIndex; i++) {
    await genSpeaker(state.nSpeakers * 3 + 2, state.freqIndex[i]);
    await genSub(state.freqIndex[i]);
    await postNext('Add SPL offset', state.nSpeakers * 3 + 4, { offset: 6 });
    ({isPossible, requiredDelay, isInverted, excessPhase} = await align4impulse(state.nSpeakers * 3 + 3, state.nSpeakers * 3 + 4));
    if (!isPossible) {
        console.info(`Crossover frequency: ${state.freqIndex[i]}, alignment not possible within delay limits!`);
    } else {
        state.noInversion 
            ? console.info(`Crossover frequency: ${state.freqIndex[i]}Hz, required delay: ${-requiredDelay.toFixed(2)}ms, expected dip removal efficiency: ${(100 - excessPhase).toFixed(2)}%`)
            : console.info(`Crossover frequency: ${state.freqIndex[i]}Hz, required delay: ${-requiredDelay.toFixed(2)}ms (subwoofer polarity inverted) , expected dip removal efficiency: ${(100 - excessPhase).toFixed(2)}%`);
        smallPossible = true;
        if (excessPhase < normDev) {
            normDev = excessPhase;
            normXO = state.freqIndex[i];
            normDelay = requiredDelay;
            normInv = isInverted;
            state.solution = true;
        }
    };
    await postDelete(state.nSpeakers * 3 + 4);
    await postDelete(state.nSpeakers * 3 + 3);
  };
  await postDelete(state.nSpeakers * 3 + 2);
  if (!smallPossible) {console.log(`Subwoofer alignment with front speakers set as 'small' was not possible in the searched crossover frequency range!`);}
  if (state.forceCentre && state.forceSmall) {console.warn("Subwoofer alignment for Centre speaker can only be forced with Front speakers set to 'Large'! Overriding 'state.forceSmall'...")};
  if (state.forceCentre) {lmDev = Infinity; state.forceLarge = true; state.forceSmall = false;}
  if (state.forceSmall && smallPossible) {frontLFE = Infinity; lmDev = Infinity; state.forceLarge = false;};
  if (state.forceLarge && state.solution) {normDev = Infinity};
  const winner = Math.min(frontLFE, lmDev, normDev);
  if (state.solution || smallPossible) {
    console.log("Selected optimal set up:")
    if (state.forceSmall || state.forceLarge || state.forceCentre || state.forceWeak) {console.warn("User override!")};
    if (state.forceWeak) {
      for (let i = 1; i < state.nSpeakers; i++) {
        ["C", "SLA", "SRA", "SBL", "SBR"].includes(state.commandId[i]) ? state.customCrossover[i] = 80 : state.customCrossover[i] = 120;
      };
      normDev = winner;
    }
    if (normDev === winner && smallPossible) {
      console.log(`Front speakers will be set to 'Small' and crossed over with the subwoofer(s) at ${normXO}Hz`);
      state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FL")] = normXO;
      state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FR")] = normXO;
      subMoves = normDelay / 1000;
      inversion = normInv;
    }
    else if (lmDev === winner && state.solution) {
      state.lfePlusMain = true;
      state.bassExtractionLPF = lmXO;
      if (state.forceSmall && !smallPossible) {console.warn("System override!");}
      console.warn(`Front speakers will be set to 'Large / Full range', set 'Subwoofer Mode' to 'LFE + Main', set 'bass extraction lpf' to ${lmXO}Hz in the AVR`);
      state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FL")] = "L";
      state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FR")] = "L";
      subMoves = lmDelay / 1000;
      inversion = lmInv;
    }
    else if (frontLFE === winner) {
      state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FL")] = "L";
      state.customCrossover[Object.keys(state.commandId).find(key => state.commandId[key] === "FR")] = "L";
      console.warn(`Front speakers will be set to 'Large / Full range', set 'Subwoofer Mode' to 'LFE' in the AVR`);
      if (!Object.values(state.commandId).includes("C")) {
        console.warn(`Subwoofer could be aligned to 'Center' speaker but you don't seem to have one! Try running Evo with "Force large fronts" option.`);
        //await alignSurrounds();
        subMoves = 0;
      } else {
          const result = await alignCenter();
          if (result !== false) {
            centerAligned = true;
            const { centerInv, centerDelay } = result;
            subMoves = centerDelay / 1000;
            inversion = centerInv;
          } else {console.warn("Subwoofer could not be aligned to the Centre speaker! The option is not suitable for your system.");}
        };
  };
  } else {
    console.warn("It's not been possible to align your subwoofer(s) with the front speakers despite all attempts!");
    console.warn("Please check your subwoofer(s) for the cause of excessive delays.");
    console.warn("Optimization will continue applying maximum possible delay to your sub(s) but the final calibration will not be optimal!");
    subMoves = state.maxPositive / 1000;
  }
  if (inversion) { await postSafe(`http://localhost:4735/measurements/${state.nSpeakers * 3}/command`, { command: "Invert" }, "Invert completed"); };
  await postNext('Offset t=0', state.nSpeakers * 3, { offset: subMoves, unit: "seconds" });
  if (state.numSub > 1) {
    for (let i = state.nSpeakers; i <= state.nSpeakers + state.numSub - 1; i++) {
      state.mSec[i] += subMoves;
      state.invertSub[i] = inversion ? !state.invertSub[i] : state.invertSub[i];
    }
  } else {
    state.mSec[state.nSpeakers] += subMoves;
    state.invertSub[state.nSpeakers] = inversion;
  }
  let distMinSub = Infinity;
  for (let i = state.nSpeakers; i <= state.nSpeakers + state.numSub - 1; i++) {
    state.customDistance[i] = state.cDist + (state.mSec[i] - state.mSec[1]) * state.sOs;
    if (state.customDistance[i] < distMinSub) { distMinSub = state.customDistance[i]; }
  }
  if (distMinSub < 0) {
    console.warn("Speaker distances are being shifted to accommodate the required subwoofer delay and will no longer reflect actual physical distances!");
    console.info("This adjustment will ONLY improve overall sound quality.");
    console.info("The receiver only accounts for relative time delays between speakers which are being kept intact.");
  }
  console.log("Final speaker distances:");
  for (let i = 1; i <= state.nSpeakers + state.numSub - 1; i++) {
    state.customDistance[i] = state.cDist + (state.mSec[i] - state.mSec[1]) * state.sOs;
    if (distMinSub < 0) {
      state.customDistance[i] += Math.abs(distMinSub);
    }
    state.customDistance[i] = Math.round(parseFloat(state.customDistance[i]) * 100) / 100;
    if (i >= state.nSpeakers) {
        console.warn(`${state.commandId[i]}: ${state.customDistance[i].toFixed(2)} meters, ${state.invertSub[i] ? "please SWITCH this subwoofer's POLARITY!" : "keep this subwoofer's polarity 'as is'."}`);
      } else {
      console.log(`${state.commandId[i]}: ${state.customDistance[i].toFixed(2)} meters`);
    }
  }
  if (state.bassMode != "Directional" && state.swChannelCount > 1 && inversion) { console.warn(`You will need to switch polarity of EACH of your ${state.swChannelCount} subwoofers!`) }
  let delay0 = -Infinity;
  for (let i = state.nSpeakers; i <= state.nSpeakers + state.numSub - 1; i++) {
    if (state.customDistance[i] > delay0) {
      delay0 = state.customDistance[i];
    }
  }
  for (let i = state.nSpeakers; i <= state.nSpeakers + state.numSub - 1; i++) {
    state.delayAdjustment[i] = (delay0 - state.customDistance[i]).toFixed(2);
  }
  if (state.invertSub.some(Boolean)) {
    console.log("Reminder: DO NOT FORGET to physically switch the polarity of subwoofer(s) as instructed above.");
    console.log("You DO NOT need to repeat Audyssey measurements after inverting subwoofer(s), optimization calculations already account for that.");
  };
  console.info("Optimizing crossover frequencies for the remaining speakers:");
  oCount = 1;
  i = state.nSpeakers + 2;
  const mData = await fetch_mREW();
  const title = {};
  for (const key in mData) {title[key] = mData[key].title};
  while (i <= (state.nSpeakers * 3 - 2)) {
    if (title[i] === "FLfinal") {i += 4; oCount += 2; continue;}
    if (title[i] === "Cfinal" && centerAligned === true) {i += 2; oCount += 1; continue;}
    if (title[i] != "Cfinal" && title[i] != "CHfinal" && title[i] != "TSfinal" && title[i] != "SBfinal") {
      await postNext('Vector average', [i, i + 2]);
      console.info(`Speaker pair: ${title[i].slice(0, -5)} & ${title[i + 2].slice(0, -5)} set to 'Small':`);
      minXO = Math.min(state.customCrossover[oCount], state.customCrossover[oCount + 1]);
      maxXO = Math.max(state.customCrossover[oCount], state.customCrossover[oCount + 1]);
      let firstIndex = state.freqIndex.indexOf(minXO);
      let lastIndex = state.freqIndex.indexOf(maxXO);
      if (firstIndex === 0) {firstIndex = 1};
      if (lastIndex <= 3) {lastIndex = 4;} else if (lastIndex < 7) {lastIndex = 7;}
      if (state.forceWeak) {firstIndex = state.freqIndex.indexOf(state.customCrossover[oCount]); lastIndex = firstIndex;}
      if (firstIndex === 8) {firstIndex--};
      let minSum = Infinity;        
      let tempFI= firstIndex, tempLI = lastIndex;
      const pairName = title[i].replace("final", "");
      range = perSpeakerXOSearchRange[pairName] || [];
      if (range.length === 1) {
        firstIndex = state.freqIndex.indexOf(range[0]);
        lastIndex = firstIndex;
        if (firstIndex < 1) {
          console.error(`Custom setting '${range[0]}' is not a valid crossover frequency!`);
          console.warn("Skipping custom crossover settings and returning to default values...");
          firstIndex = tempFI; lastIndex = tempLI;
        };
      }
      if (range.length >= 2) {
        firstIndex = state.freqIndex.indexOf(range[0]);
        lastIndex = state.freqIndex.indexOf(range[1]);
        if (firstIndex < 0 || lastIndex < 0 || range.length > 2) {
          console.error(`Please check your customized crossover search frequency range settings for speaker ${pairName}!`);
          console.warn("Skipping custom crossover settings and returning to default values...");
          firstIndex = tempFI; lastIndex = tempLI;
        }
        if (lastIndex < firstIndex) {lastIndex = firstIndex;}
      };
      for (let j = firstIndex; j <= lastIndex; j++) {
        await genSpeaker(state.nSpeakers * 3 + 2, state.freqIndex[j]);
        await genSub(state.freqIndex[j]);
        await postNext('Add SPL offset', state.nSpeakers * 3 + 4, { offset: 6 });
        await postNext('Arithmetic', [state.nSpeakers * 3 + 4, state.nSpeakers * 3 + 3], { function: "A + B" });
        const error = await rmsError(state.nSpeakers * 3 + 5);
        console.info(`Crossover frequency: ${state.freqIndex[j]}Hz, expected dip removal efficiency: ${(100 - error).toFixed(2)}%`);
        await postDelete(state.nSpeakers * 3 + 5);
        await postDelete(state.nSpeakers * 3 + 4);
        await postDelete(state.nSpeakers * 3 + 3);
        if (error < minSum){
          minSum = error;
          state.customCrossover[oCount] = state.freqIndex[j];
          state.customCrossover[oCount + 1] = state.freqIndex[j];
        };
      };
      await postDelete(state.nSpeakers * 3 + 2);
      i += 4;
      oCount += 2;
    } else {
        await postNext('Vector average', [i, i]);
        console.info(`Speaker: ${title[i].slice(0,-5)} set to 'Small':`);
        xo = state.customCrossover[oCount];
        let firstIndex = state.freqIndex.indexOf(xo);
        let lastIndex = firstIndex;
        if (firstIndex === 0) {firstIndex = 1};
        if (lastIndex <= 3) {lastIndex = 4;} else if (lastIndex < 7) {lastIndex = 7;}
        if (firstIndex === 8) {firstIndex--};
        let minSum = Infinity;
        if (state.forceWeak) {firstIndex = state.freqIndex.indexOf(state.customCrossover[oCount]);}
        let tempFI= firstIndex, tempLI = lastIndex;
        const spName = title[i].replace("final", "");
        range = perSpeakerXOSearchRange[spName] || [];
        if (range.length === 1) {
          firstIndex = state.freqIndex.indexOf(range[0]);
          lastIndex = firstIndex;
          if (firstIndex < 1) {
            console.error(`Custom setting '${range[0]}' is not a valid crossover frequency!`);
            console.warn("Skipping custom crossover settings and returning to default values...");
            firstIndex = tempFI; lastIndex = tempLI;
          };
        }
        if (range.length >= 2) {
          firstIndex = state.freqIndex.indexOf(range[0]);
          lastIndex = state.freqIndex.indexOf(range[1]);
          if (firstIndex < 0 || lastIndex < 0 || range.length > 2) {
            console.error(`Please check your customized crossover search frequency range settings for speaker ${spName}!`);
            console.warn("Skipping custom crossover settings and returning to default values...");
            firstIndex = tempFI; lastIndex = tempLI;
          }
          if (lastIndex < firstIndex) {lastIndex = firstIndex;}
        }
        for (let j = firstIndex; j <= lastIndex; j++) {
          await genSpeaker(state.nSpeakers * 3 + 2, state.freqIndex[j]);
          await genSub(state.freqIndex[j]);
          await postNext('Arithmetic', [state.nSpeakers * 3 + 4, state.nSpeakers * 3 + 3], { function: "A + B" });
          const error = await rmsError(state.nSpeakers * 3 + 5);
          console.info(`Crossover frequency: ${state.freqIndex[j]}Hz, expected dip removal efficiency: ${(100 - error).toFixed(2)}%`);
          await postDelete(state.nSpeakers * 3 + 5);
          await postDelete(state.nSpeakers * 3 + 4);
          await postDelete(state.nSpeakers * 3 + 3);
          if (error < minSum){
            minSum = error;
            state.customCrossover[oCount] = state.freqIndex[j];
          };
        };
        await postDelete(state.nSpeakers * 3 + 2);
        i += 2;
        oCount ++;
    };
  };
  console.log("Final crossover frequencies will automatically be set as follows:");
  for (let i = 1; i < state.nSpeakers; i++) {
    state.customCrossover[i] === "L" ? console.log(`Speaker ${state.commandId[i]}: 'Large / Full range'`) : console.log(`Speaker ${state.commandId[i]}: ${state.customCrossover[i]}Hz`);
  };
  console.warn("Changing the above crossover frequencies manually in the receiver is not recommended, adjust them with Evo per speaker XO customization options inside the script instead!");
  if (winner === frontLFE || winner === lmDev) {
    console.log("The settings below should be manually applied in the receiver's set up menu:")
    if (winner === frontLFE) {console.warn("Please set 'Subwoofer Mode' to 'LFE' in your receiver!")} else {
      console.warn(`Please set 'Subwoofer Mode' to 'LFE + Main', set 'Bass extraction lpf' to ${lmXO}Hz in your receiver!`)
      console.log(`In older receivers, 'bass extraction lpf' can be set by the crossover frequency of the 'Large' speaker pair in 'LFE + Main' mode!`);
    };
  };
}
async function largeSpeakers(ind) {
  console.info(`Analysing 'Large / Full range' front main speakers in 'Subwoofer Mode: LFE + Main' setting:`);
  let lmDev = Infinity, lmXO, lmDelay, lmInv;
  let monoSub = 0;
  if (state.limitLPF === true) {
      monoSub = 4;
      console.log("Limiting subwoofer LPF search frequency to avoid bass localization due to user override!");
  } else if (state.limitLPF === false) {
      monoSub = 0;
      console.log("Unlimited range subwoofer LPF frequency search due to user override! Some bass may end up localized!");
  } else if (state.limitLPF === null) {
      if ((state.bassMode === "Directional" && (state.numSub === 1 || state.numSub === 3)) || (state.bassMode !== "Directional" && (state.swChannelCount === 1 || state.swChannelCount === 3))) {
          monoSub = 4;
          console.log("Limiting search frequency to avoid bass localization due to asymmetry caused by odd number of subwoofers!");
      } else {
          monoSub = 0;
      }
  }
  for (let i = 1; i < (state.freqLength - monoSub); i++) {
    await genSub(state.freqIndex[i]);
    ({isPossible, requiredDelay, isInverted, excessPhase} = await align4impulse(ind, state.nSpeakers * 3 + 3));
    if (!isPossible) {
        console.info(`Subwoofer LPF frequency: ${state.freqIndex[i]}Hz, alignment not possible within delay limits!`);
    } else {
        state.noInversion 
            ? console.info(`Sub LPF frequency: ${state.freqIndex[i]}Hz, required delay: ${-requiredDelay.toFixed(2)}ms, expected dip removal efficiency: ${(100 - excessPhase).toFixed(2)}%`)
            : console.info(`Sub LPF frequency: ${state.freqIndex[i]}Hz, required delay: ${-requiredDelay.toFixed(2)}ms (subwoofer polarity inverted) , expected dip removal efficiency: ${(100 - excessPhase).toFixed(2)}%`);
        if (excessPhase < lmDev) {
          state.solution = true;
          lmDev = excessPhase;
          lmXO = state.freqIndex[i];
          lmDelay = requiredDelay;
          lmInv = isInverted;
        };
    };
    await postDelete(state.nSpeakers * 3 + 3);
  }
  return {lmDev, lmXO, lmDelay, lmInv};
}
async function findXO(indX, mCount) {
  let iXO, sum, minSum = Infinity, k;
  await postNext('Smooth', indX, { smoothing: "None" });
  const magnitudeArray = [];
  const spResponse = await fetchSafe('frequency-response', indX);
  let startFreq = spResponse.startFreq;
  let k1 = 15.75, k2 = 250;
  if ('freqStep' in spResponse) {
    let freqStep = spResponse.freqStep;
    k1 = Math.round((k1 - startFreq) / freqStep);
    k2 = Math.round((k2 - startFreq) / freqStep);
  } else if ('ppo' in spResponse) {
    const ppo = spResponse.ppo;
    k1 = Math.round(Math.log2(k1 / startFreq) * ppo);
    k2 = Math.round(Math.log2(k2 / startFreq) * ppo);
  };
  const bytes = Uint8Array.from(atob(spResponse.magnitude), c => c.charCodeAt(0));
  const buffer = bytes.buffer;
  const data = new DataView(buffer);
  for (let k = k1; k <= k2; k++) {
    const spMagnitude = data.getFloat32(k * 4);
    magnitudeArray.push(spMagnitude);
  }
  for (let i = state.nSpeakers * 3 + 2; i <= mCount; i++) {
    sum = 0;
    const xoResponse = await fetchSafe('frequency-response', i);
    const bytesXo = Uint8Array.from(atob(xoResponse.magnitude), c => c.charCodeAt(0));
    const bufferXo = bytesXo.buffer;
    const dataXo = new DataView(bufferXo);
    startFreq = xoResponse.startFreq;
    k1 = 15.75; k2 = 250;
    if ('freqStep' in xoResponse) {
      freqStep = xoResponse.freqStep;
      k1 = Math.round((k1 - startFreq) / freqStep);
      k2 = Math.round((k2 - startFreq) / freqStep);
    } else if ('ppo' in xoResponse) {
      const ppo = xoResponse.ppo;
      k1 = Math.round(Math.log2(k1 / startFreq) * ppo);
      k2 = Math.round(Math.log2(k2 / startFreq) * ppo);
    };
    let t = 0;
    for (let k = k1; k <= k2; k++) {
      const xoMagnitude = dataXo.getFloat32(k * 4);
      if (magnitudeArray[t] > state.targetLevel) { break; }
      const dif = magnitudeArray[t] - xoMagnitude;
      sum += dif * dif;
      t++;
    }
    if (t === 0) {iXO = i; break;}
    const meanOfSquares = sum / t;
    const rmsE = Math.sqrt(meanOfSquares);
    if (rmsE < minSum) {
      minSum = rmsE;
      iXO = i;
    }
  }
  return iXO;
}
async function multipleSubs(configSub) {
  let sumIndex, loDelay, hiDelay;
  let isPossibleI = false, requiredDelayI = NaN, isInverted = false;
  const alignmentResults = [];
  let keeperDelay = new Array(state.numSub).fill(0);
  let i1 = state.nSpeakers + configSub[0];
  let i2 = state.nSpeakers + configSub[1];
  const loDelay0 = state.msecMin - state.mSec[i1];
  const hiDelay0 = 0;
  loDelay = loDelay0 - (state.mSec[i2] - state.mSec[i1]) * (state.mSec[i2] < state.mSec[i1]);
  hiDelay = hiDelay0 - (state.mSec[i2] - state.mSec[i1]) * (state.mSec[i2] > state.mSec[i1]);
  let tempHi = 0; let tempLo = 0;
  const maxDelay = 6.00049999 / state.sOs * 1000;
  loDelay *= -1000; hiDelay *= -1000;
  if (loDelay > maxDelay) {loDelay = maxDelay;}
  if (hiDelay < -maxDelay) {hiDelay = -maxDelay;}
  if (loDelay < 0) {tempLo = loDelay; loDelay = 0;}
  if (hiDelay > 0) {tempHi = hiDelay; hiDelay = 0;}
  ({ isPossibleI, requiredDelayI, isInverted, sumIndex } = await alignMsub(i1, i2, hiDelay, loDelay));
  if ((tempLo < 0 && requiredDelayI < tempLo) || (tempHi > 0 && requiredDelayI > tempHi)) { isPossibleI = false; }
  alignmentResults.push({ isPossibleI, requiredDelayI, isInverted });
  if (!isPossibleI) { return { alignmentResults, finalIndex: null }; }
  keeperDelay[0] = 0;
  keeperDelay[1] = requiredDelayI / 1000;
  for (let i = 2; i < configSub.length; i++) {
    i2 = state.nSpeakers + configSub[i];
    const minRequired = Math.max(...keeperDelay) - 6.00049999 / state.sOs;
    const maxRequired = Math.min(...keeperDelay) + 6.00049999 / state.sOs;
    loDelay = loDelay0 - (state.mSec[i2] - state.mSec[i1]) * (state.mSec[i2] < state.mSec[i1]);
    hiDelay = hiDelay0 - (state.mSec[i2] - state.mSec[i1]) * (state.mSec[i2] > state.mSec[i1]);
    loDelay = Math.max(loDelay, minRequired);
    hiDelay = Math.min(hiDelay, maxRequired);
    loDelay *= -1000; hiDelay *= -1000;
    tempLo = 0; tempHi = 0;
    if (loDelay < 0) {tempLo = loDelay; loDelay = 0;}
    if (hiDelay > 0) {tempHi = hiDelay; hiDelay = 0;}
    ({ isPossibleI, requiredDelayI, isInverted, sumIndex } = await alignMsub(sumIndex, i2, hiDelay, loDelay));
    if ((tempLo < 0 && requiredDelayI < tempLo) || (tempHi > 0 && requiredDelayI > tempHi)) { isPossibleI = false; }
    alignmentResults.push({ isPossibleI, requiredDelayI, isInverted });
    if (!isPossibleI) { return { alignmentResults, finalIndex: null }; }
    keeperDelay[i] = requiredDelayI / 1000;
  }
  return { alignmentResults, finalIndex: sumIndex };
}
async function tectonic() {
  let isPossibleI = false, requiredDelayI = NaN, isInverted = false, excessPhaseI = NaN;
  let maxSubVolume = 0, minSubVolume = 0;
  for (let i = state.nSpeakers; i <= (state.nSpeakers + state.numSub - 1); i++) {
    state.subLPF[i - state.nSpeakers] ? await genSub(250, i) : await genSub(120, i);
  }
  console.info("Matching subwoofer volumes...");
  for (let i = state.nSpeakers; i <= (state.nSpeakers + state.numSub - 1); i++) {
    console.info(`Subwoofer #${i - state.nSpeakers + 1}:`);
    state.customLevel[i] = await rmsVolume(i);
    if (state.customLevel[i] < -12) {console.warn(`SW${i - state.nSpeakers + 1} volume is too high and can only be decreased by -12dB (hardware limit). Optimization will not be optimal!`); state.customLevel[i] = -12;};
    if (state.customLevel[i] > 12) {console.warn(`SW${i - state.nSpeakers + 1} volume is too low and can only be increased by +12dB (hardware limit). Optimization will not be optimal!`); state.customLevel[i] = 12;};
    if (state.customLevel[i] > maxSubVolume) {maxSubVolume = state.customLevel[i]};
    if (state.customLevel[i] < minSubVolume) {minSubVolume = state.customLevel[i]}
  }
  state.subLO -= minSubVolume;
  state.subHI -= maxSubVolume;
  for (let i = state.nSpeakers + 2 * state.numSub - 1; i > state.nSpeakers + state.numSub - 1; i--){
    await postDelete(i);
  }
  let finalIndex;
  console.info("Aligning multiple subs between each other for best bass performance...")
  const subOrders = {
    2: [[0, 1], [1, 0]],
    3: [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]],
    4: [[0,1,2,3], [0,1,3,2], [0,2,1,3], [0,2,3,1], [0,3,1,2], [0,3,2,1],
        [1,0,2,3], [1,0,3,2], [1,2,0,3], [1,2,3,0], [1,3,0,2], [1,3,2,0],
        [2,0,1,3], [2,0,3,1], [2,1,0,3], [2,1,3,0], [2,3,0,1], [2,3,1,0],
        [3,0,1,2], [3,0,2,1], [3,1,0,2], [3,1,2,0], [3,2,0,1], [3,2,1,0]]
  };
  const subOrder = subOrders[state.numSub];
  let finalIndices = [];
  let finalResults = [];
  for (const configSub of subOrder) {
    const result = await multipleSubs(configSub);
    const { finalIndex, alignmentResults } = result;
    if (finalIndex === null) {
      console.warn("No alignment possible for this configuration:", configSub);
    } else {
      console.info(`Sub array: [${configSub}]`);
      finalIndices.push(finalIndex);
      finalResults.push(finalIndex, configSub, alignmentResults);
    }
  }
  if (finalIndices.every(element => element === false)) {
    console.warn("All attempts to align your subwoofers between each other have failed!");
    console.error("Optimization cannot continue!");
    console.log("Please identify the reason and fix excessive delays in one or more of your subs then repeat Audyssey calibration!");
    throw new Error("Optimization cannot continue — unable to align subwoofers between each other.");
  }
  let bestEP = Infinity, bestI, iCount = 1, bestCount = null;
  for (const index of finalIndices) {
    if (index !== null) {
      const epSum = await calcEP(index, 50);
      if (epSum < bestEP) { bestEP = epSum; bestI = index; bestCount = iCount; }
      console.info(`Configuration #${iCount} average bass region excess phase: ${epSum}°`);
      iCount++;
    }
  }
  const targetIndex = finalResults.indexOf(bestI);
  const configurationArray = finalResults[targetIndex + 1];
  console.info(`Optimal selection: Configuration #${bestCount} [${configurationArray}] with ${(bestEP).toFixed(2)}° average excess phase.`);
  state.invertSub[state.nSpeakers + configurationArray[0]] = false;
  for (let i = 0; i < (state.numSub - 1); i++) {
    const requiredDelayIValue = finalResults[targetIndex + 2][i].requiredDelayI;
    const newsubI = state.nSpeakers + configurationArray[i + 1]
    state.invertSub[newsubI] = finalResults[targetIndex + 2][i].isInverted;
    if ((state.mSec[newsubI] + requiredDelayIValue / 1000) < state.msecMinSub) { state.msecMinSub = state.mSec[newsubI] + requiredDelayIValue / 1000 }
    if ((state.mSec[newsubI] + requiredDelayIValue / 1000) > state.msecMaxSub) { state.msecMaxSub = state.mSec[newsubI] + requiredDelayIValue / 1000 }
    state.mSec[newsubI] = state.mSec[newsubI] + requiredDelayIValue / 1000;
  }
  state.msecMinSub = Math.min(state.msecMinSub, state.mSec[state.nSpeakers + configurationArray[0]]);
  state.msecMaxSub = Math.max(state.msecMaxSub, state.mSec[state.nSpeakers + configurationArray[0]]);
  await fetch_mREW(bestI, 'PUT', { title: "SW1o" });
  await fetch_mREW(state.nSpeakers, 'PUT', { title: "tempSub" });
  const measurements = await fetch_mREW();
  const mCount = Object.keys(measurements).length;
  for (let i = mCount; i >= state.nSpeakers; i--) {
    const title = measurements[i].title;
    if (title != "SW1o") { await postDelete(i); }
  }
  const splOffset = -state.numSub * 3;
  await postNext('Add SPL offset', state.nSpeakers, { offset: splOffset });
  state.maxNegative = (state.msecMin - state.msecMinSub) * 1000;
  state.maxPositive = (state.msecMax - state.msecMaxSub) * 1000;
}

export { aceXO, largeSpeakers, findXO, multipleSubs, tectonic };
