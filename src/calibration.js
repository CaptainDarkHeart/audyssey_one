import { state } from './state.js';
import { modelsSoS300, micCalProb, noxo180 } from './data/receivers.js';
import { antiMicCal } from './data/mic-cal.js';
import { REW_HOST, baseUrl, speedDelay, fetch_mREW, postSafe, postDelete } from './rew-api.js';
import { CenterSpeakerDistance } from './config.js';
import { updateCheckboxStates } from './ui.js';

function extractAdy(event) {
  console.info("Initialising A1 Evo Nexus 1.5 ...");
  updateCheckboxStates();
  const file = event.target.files[0];
  state.fileName = file.name;
  console.info(`Audyssey calibration '${state.fileName}' has been uploaded!`)
  const reader = new FileReader();
  reader.onload = async function (e) {
    let adyContents = e.target.result;
    state.jsonData = JSON.parse(adyContents);
    let modelName = state.jsonData.targetModelName;
    const model = modelName.slice(-6);
    state.sOs = modelsSoS300.includes(model) ? 300.00 : 343.00;
    state.isCirrusLogic = micCalProb.includes(model) ? true : false;
    state.hasxo180 = noxo180.includes(model) ? false : true;
    state.hasxo180 ? state.freqIndex = [15.75, 40, 60, 80, 90, 100, 110, 120, 150, 180, 200, 250] : state.freqIndex = [15.75, 40, 60, 80, 90, 100, 110, 120, 150, 200, 250];
    state.freqLength = state.freqIndex.length;
    console.info(`Speed of sound setting has been automatically adjusted for your ${modelName} at ${state.sOs} m/s.`);
    const hasSWChannels = state.jsonData.detectedChannels.some(channel => channel.commandId && channel.commandId.startsWith("SW"));
    if (!hasSWChannels) {
      console.error("No subwoofer detected in your calibration file. The tool cannot complete optimization without a subwoofer in the system!");
      throw new Error("No subwoofer channel found in calibration file");
    }
    state.subLO = -12;
    state.subHI = 12;
    state.cDist = getDistance(state.jsonData.detectedChannels);
    if (`subwooferLayout` in state.jsonData) {state.jsonData.subwooferLayout = "N/A"}
      if (`subwooferMode` in state.jsonData) {
        state.jsonData.subwooferMode = state.sOs === 343 ? "Standard" : "N/A";
      }
    const zerosArray = [1, ...Array(16383).fill(0)];
    state.jsonData.dynamicVolume = false;
    state.jsonData.lfc = false;
    state.jsonData.dynamicEq = false;
    state.jsonData.enTargetCurveType = 1;
    let subwooferTypeStart = 54;
    let subwooferCounter = 0;
    const subwooferChannels = state.jsonData.detectedChannels.filter(channel => channel.commandId.startsWith("SW"));
    state.numSub = subwooferChannels.length;
    state.jsonData.detectedChannels.forEach((channel, index) => {
      const isSubwoofer = channel.commandId.startsWith("SW");
      const isFirstSubwoofer = isSubwoofer && index === state.jsonData.detectedChannels.indexOf(subwooferChannels[0]);
      if (isSubwoofer) {
        channel.enChannelType = subwooferTypeStart + subwooferCounter;
        subwooferCounter++;
        channel.midrangeCompensation = true;
        channel.frequencyRangeRolloff = 250;
        channel.customLevel = "0.0";
        channel.customDistance = 0.0;
        channel.channelReport.customEnSpeakerConnect = 3;
        channel.channelReport.distance = 0;
        channel.channelReport.isReversePolarity = true;
        channel.trimAdjustment = "0.0";
        channel.delayAdjustment = "0.0";
        if ('state.customCrossover' in channel) { delete channel.customCrossover; }
        if ('customSpeakerType' in channel) { delete channel.customSpeakerType; }

        if (isFirstSubwoofer) {
          channel.customTargetCurvePoints = [];
          const responseData = channel.responseData;
          const keysToKeep = Object.keys(responseData).slice(0, 3);
          keysToKeep.forEach(key => {
            responseData[key] = state.isCirrusLogic ? antiMicCal : zerosArray;
          });
          Object.keys(responseData).forEach(key => {
            if (!keysToKeep.includes(key)) {
              delete responseData[key];
            }
          });
        } else {
          if ('customTargetCurvePoints' in channel) { delete channel.customTargetCurvePoints; }
          channel.responseData = {};
        }
      } else {
        channel.customTargetCurvePoints = [];
        channel.midrangeCompensation = false;
        channel.frequencyRangeRolloff = 20000;
        channel.customLevel = "0.0";
        channel.customDistance = 0.0;
        channel.customCrossover = "F";
        channel.customSpeakerType = "L";
        channel.channelReport.customEnSpeakerConnect = 2;
        channel.channelReport.distance = 0;
        channel.customTargetCurvePoints = [];
        const responseData = channel.responseData;
        const keysToKeep = Object.keys(responseData).slice(0, 3);
        keysToKeep.forEach(key => {
          responseData[key] = state.isCirrusLogic ? antiMicCal : zerosArray;
        });
        Object.keys(responseData).forEach(key => {
          if (!keysToKeep.includes(key)) {
            delete responseData[key];
          }
        });

      }
    });
    (async function() {
          try {
            document.getElementById('saveButton').disabled = false;
            document.getElementById('saveDEQButton').disabled = false;
            await compareREW();
            if (!state.dontStart) {document.getElementById('startButton').disabled = false}
          } catch (error) {
            console.error("An error occurred:", error);
          }
        })();
  }
  reader.readAsText(file);
}
async function saveBaseJson() {
  state.jsonData.dynamicEq = false;
  let adyContents = JSON.stringify(state.jsonData, null, 2);
  const blob = new Blob([adyContents], { type: 'application/json' });
  const urlBlob = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = urlBlob;
  downloadLink.download = "AVReceiverREWmode.ady";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}
async function saveDeqBaseJson() {
  state.jsonData.dynamicEq = true;
  let adyContents = JSON.stringify(state.jsonData, null, 2);
  const blob = new Blob([adyContents], { type: 'application/json' });
  const urlBlob = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = urlBlob;
  downloadLink.download = "AVReceiverREWmodeDEQ.ady";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}
function getDistance(channels) {
  let dist = parseFloat(channels[1].channelReport.distance);
  if (isNaN(dist) || dist === 0) {
    dist = parseFloat(channels[1].customDistance);
    if (isNaN(dist) || dist === 0 || dist === null) {
      dist = 2.75;
      state.noDistance = true;
    }
  }
  if (CenterSpeakerDistance > 0) {
    dist = CenterSpeakerDistance / 343 * state.sOs;
    state.noDistance = false;
  }
  return dist;
}
async function sortREW(){
  console.info("Checking and sorting measurements in REW...");
  let noErrors = true;
  const allowedNames = ['FL','FR','C','SLA','SRA','SBL','SBR','SB','FHL','FHR','FWL','FWR','TFL','TFR','TML','TMR','TRL','TRR','RHL','RHR','FDL','FDR','SDL','SDR','BDL','BDR','SHL','SHR','TS','CH','SW1','SW2','SW3','SW4'];
  let measurements = await fetch_mREW();
  let mCount = Object.keys(measurements).length;
  let measurementArray = Object.keys(measurements).map(key => ({
    index: parseInt(key),
    title: measurements[key].title
  }));
  let titleSet = new Set();
  let duplicates = [];
  let invalidNames = [];
  for (let measurement of measurementArray) {
    if (titleSet.has(measurement.title)) {
      duplicates.push(measurement.title);
    } else {
      titleSet.add(measurement.title);
    }
    if (!allowedNames.includes(measurement.title)) {
      invalidNames.push(measurement.title);
    }
  }
  if (duplicates.length > 0) {
    console.warn("Duplicate measurements found:\n" + duplicates.join("\n"));
    noErrors = false;
  }
  if (invalidNames.length > 0) {
    console.warn("Measurements with invalid names found:\n" + invalidNames.join("\n"));
    noErrors = false;
  }
  if (noErrors) {
    let swMeasurements = measurementArray.filter(m => m.title.startsWith("SW"));
    let bdMeasurements = measurementArray.filter(m => m.title.startsWith("BD"));
    let otherMeasurements = measurementArray.filter(m => !m.title.startsWith("SW") && !m.title.startsWith("BD"));
    swMeasurements.sort((a, b) => a.title.localeCompare(b.title));
    bdMeasurements.sort((a, b) => a.title.localeCompare(b.title));
    otherMeasurements.sort((a, b) => a.title.localeCompare(b.title));
    let sortedMeasurements = [
      ...otherMeasurements,
      ...bdMeasurements,
      ...swMeasurements
    ];
    let newIndex = mCount + 1;
    for (let measurement of sortedMeasurements) {
      await postSafe(`${REW_HOST}/measurements/${measurement.index}/command`, { command: "Response copy" }, "Completed");
      const titleNew = measurement.title + "o";
      await fetch_mREW(newIndex, 'PUT', {title: titleNew});
      newIndex++;
    }
    for (let i = mCount; i >= 1; i--) {
      await postDelete(i);
    }
    for (let i = 1; i <= state.nSpeakers + state.numSub - 1; i++) {
      const mt = await fetch_mREW(i);
      const t = mt.title;
      state.commandId[i] = t.slice(0, -1);
    }
    console.info("Measurements in REW are consistent amd have been successfully sorted.");
  } else {
    console.warn("Please check your REW measurements. Optimization cannot continue!");
    throw new Error("REW measurements are invalid — check warnings above");
  }
}
async function compareREW() {
  const allowedNames = ['FL','FR','C','SLA','SRA','SBL','SBR','SB','FHL','FHR','FWL','FWR','TFL','TFR','TML','TMR','TRL','TRR','RHL','RHR','FDL','FDR','SDL','SDR','BDL','BDR','SHL','SHR','TS','CH','SW1','SW2','SW3','SW4'];
  try {
    let measurements = await fetch_mREW();

    if (!measurements || Object.keys(measurements).length === 0) {
        console.warn("No measurements found in REW.");
        return; // Exit the function if no measurements are found.
    }
    state.dontStart = false;
    console.info("Comparing REW measurements with the uploaded calibration file...")
    let measurementArray = Object.keys(measurements).map(key => ({
        index: parseInt(key),
        title: measurements[key].title
    }));
    let jsonNames = state.jsonData.detectedChannels.map(channel => channel.commandId);
    let noSpeakerErrors = true;
    let rewSWMeasurements = measurementArray.filter(m => m.title.startsWith("SW"));
    let rewNonSWMeasurements = measurementArray.filter(m => !m.title.startsWith("SW"));
    let jsonSWMeasurements = jsonNames.filter(name => name.startsWith("SW"));
    let jsonNonSWMeasurements = jsonNames.filter(name => !name.startsWith("SW"));
    let unmatchedREWNames = rewNonSWMeasurements.filter(rewMeasurement => 
        !jsonNonSWMeasurements.includes(rewMeasurement.title)
    ).map(m => m.title);
    let unmatchedJSONNames = jsonNonSWMeasurements.filter(jsonName => 
        !rewNonSWMeasurements.some(rewMeasurement => rewMeasurement.title === jsonName)
    );
    if (unmatchedREWNames.length > 0 || unmatchedJSONNames.length > 0) {
        console.warn("Unmatched speakers were found:");
        noSpeakerErrors = false;
        if (unmatchedREWNames.length > 0) {
           console.warn("In REW: " + unmatchedREWNames.join(", "));
        }
        if (unmatchedJSONNames.length > 0) {
            console.warn("In uploaded calibration file (.ady): " + unmatchedJSONNames.join(", "));
        }
    }
    if (noSpeakerErrors) {
      console.info("All speaker checks passed. Proceeding with subwoofer(s) check...");
    } else {
        console.error("Measurements in REW did NOT match with the speakers in the uploaded calibration file!");
        throw new Error(`UnmatchedSpeakers: Please upload a suitable .ady file or load/replace REW measurements and restart the script.`);
    }
    state.nSpeakers = rewNonSWMeasurements.length + 1;
    let firstSWChannel = state.jsonData.detectedChannels.find(ch => ch.commandId.startsWith("SW"));
    if (!firstSWChannel) {
        console.error("No Subwoofer channel was found in the calibration file, optimization cannot proceed!");
        throw new Error(`NoSubwooferError: Evo can only optimize systems with a subwoofer.`);
    }
    if (rewSWMeasurements.length !== jsonSWMeasurements.length) {
        console.warn(`Mismatch in the number of subwoofers between REW (${rewSWMeasurements.length}) and the uploaded .ady file (${jsonSWMeasurements.length}).`);
        if (rewSWMeasurements.length === 0) {
          throw new Error(`SubwooferError: You have NO subwoofer measurements in REW. Please check and restart the script!`);
        }
        console.warn("Overriding calibration file subwoofer structure based on the number of subwoofer measurements in REW!");
        if (`subwooferNum` in state.jsonData) {state.jsonData.subwooferNum = rewSWMeasurements.length}
        let multeqType = parseInt(state.jsonData.enMultEQType);
        if (rewSWMeasurements.length > 1 && multeqType < 2) {
          throw new Error(`SubwooferError: You have more than one subwoofer measurement in REW and this is not compatible with your AV Receiver. Please check and restart the script!`);
        }
        state.jsonData.detectedChannels = state.jsonData.detectedChannels.filter(ch => !ch.commandId.startsWith("SW") || ch === firstSWChannel);
        if (multeqType > 1) {firstSWChannel.enChannelType = 54}
        let chType = parseInt(firstSWChannel.enChannelType);
        state.swChannelCount = rewSWMeasurements.length;
        state.numSub = state.swChannelCount;
        if (state.numSub > 1) {state.bassMode = "Directional"}
        for (let i = 1; i < rewSWMeasurements.length; i++) {
            let newSWChannel = JSON.parse(JSON.stringify(firstSWChannel));
            newSWChannel.commandId = `SW${i + 1}`;
            chType++;
            newSWChannel.enChannelType = chType;
            state.jsonData.detectedChannels.push(newSWChannel);
            if ('customTargetCurvePoints' in newSWChannel) {delete newSWChannel.customTargetCurvePoints;}
            newSWChannel.responseData = {};
        }
      console.log("Subwoofer reconciliation complete. Consider saving a copy of the updated base calibration file for future use!");
    } else {
    console.info("Subwoofer count consistency checks passed!");
    }
  document.getElementById('button1').disabled = true;

  } catch (error) {
      if (error.message.startsWith("UnmatchedSpeakers")) {
            console.error(error.message.replace("UnmatchedSpeakers: ", ""));
        } else if (error.message.startsWith("NoSubwooferError")) {
            console.error(error.message.replace("NoSubwooferError: ", ""));
        } else if (error.message.startsWith("SubwooferError")) {
            console.error(error.message.replace("SubwooferError: ", ""));
        } else {
            console.warn("Unable to detect REW!");
            state.dontStart = true;
        }
      return; // Gracefully exit if there was an error fetching the measurements.
  }     
}

export { extractAdy, saveBaseJson, saveDeqBaseJson, getDistance, sortREW, compareREW };
