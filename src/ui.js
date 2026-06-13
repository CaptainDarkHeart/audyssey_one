import { state } from './state.js';
import { extractAdy, saveBaseJson, saveDeqBaseJson } from './calibration.js';
import { optimizeOCA } from './pipeline.js';

function startButton_clicked() {
  document.getElementById('startButton').disabled = true;
  document.getElementById('pauseButton').disabled = false;
  document.querySelectorAll('.container > *:not(#logContainer):not(h2), .container li, .container a, .notice, .small-bullet').forEach(el => {
   if (el.id !== 'logContainer' && !el.closest('#logContainer') && !el.closest('h2')) {
     el.style.fontSize = '0.8em';
     el.style.transition = 'font-size 0.3s ease';
   }
  });
  document.querySelectorAll('.smaller-font').forEach(el => {
    el.style.fontSize = '0.7em';
  });
  document.querySelectorAll('ol, ul').forEach(el => {
    el.style.marginTop = '0.5em';
    el.style.marginBottom = '0.5em';
  });
  document.querySelectorAll('button').forEach(el => {
    el.style.fontSize = '0.8em';
    el.style.padding = '8px 16px';
  });
  const versionNumber = document.querySelector('.version-number');
  if (versionNumber) {
    versionNumber.style.float = 'none';
    versionNumber.style.display = 'inline-block';
    versionNumber.style.verticalAlign = 'middle';
    versionNumber.style.marginLeft = '10px';
  };
  const logContainer = document.getElementById('logContainer');
  logContainer.style.maxHeight = '350px';
  logContainer.style.transition = 'max-height 0.3s ease';
  document.querySelector('.customization-options').classList.add('new-style');
  document.querySelector('.notice').style.fontSize = '0.5em'; 
  optimizeOCA();
}
function updateCheckboxStates(triggeredBy) {
  const noInversionCheckbox = document.getElementById('state.noInversion');
  const forceSmallCheckbox = document.getElementById('state.forceSmall');
  const forceWeakCheckbox = document.getElementById('state.forceWeak');
  const forceCentreCheckbox = document.getElementById('state.forceCentre');
  const forceLargeCheckbox = document.getElementById('state.forceLarge');
  state.forceSmall = forceSmallCheckbox.checked;
  state.forceWeak = forceWeakCheckbox.checked;
  state.forceCentre = forceCentreCheckbox.checked;
  state.forceLarge = forceLargeCheckbox.checked;
  state.noInversion = noInversionCheckbox.checked;
  if (['state.forceSmall', 'state.forceWeak', 'state.forceCentre', 'state.forceLarge'].includes(triggeredBy)) {
        forceSmallCheckbox.disabled = false;
        forceWeakCheckbox.disabled = false;
        forceCentreCheckbox.disabled = false;
        forceLargeCheckbox.disabled = false;
      }
  if (triggeredBy === 'state.forceSmall' && state.forceSmall) {
        forceWeakCheckbox.checked = false;
        forceWeakCheckbox.disabled = true;
        forceLargeCheckbox.checked = false;
        forceLargeCheckbox.disabled = true;
        forceCentreCheckbox.checked = false;
        forceCentreCheckbox.disabled = true;
      }
  if (triggeredBy === 'state.forceWeak' && state.forceWeak) {
        forceSmallCheckbox.checked = true;
        forceSmallCheckbox.disabled = true;
        forceLargeCheckbox.checked = false;
        forceLargeCheckbox.disabled = true;
        forceCentreCheckbox.checked = false;
        forceCentreCheckbox.disabled = true;
  }
  if (triggeredBy === 'state.forceLarge' && state.forceLarge) {
        forceSmallCheckbox.checked = false;
        forceSmallCheckbox.disabled = true;
        forceWeakCheckbox.checked = false;
        forceWeakCheckbox.disabled = true;
  }
  if (triggeredBy === 'state.forceCentre' && state.forceCentre) {
        forceSmallCheckbox.checked = false;
        forceSmallCheckbox.disabled = true;
        forceWeakCheckbox.checked = false;
        forceWeakCheckbox.disabled = true;
        forceLargeCheckbox.checked = true;
        forceLargeCheckbox.disabled = true;
  }
}
function updateSubwooferLPFState() {
  const subwooferLPFSelect = document.getElementById('subwooferLPF');
  const selectedValue = subwooferLPFSelect.value;
  switch(selectedValue) {
      case 'cap':
          state.limitLPF = true;
          break;
      case 'uncap':
          state.limitLPF = false;
          break;
      case 'auto':
      default:
          state.limitLPF = null;
          break;
      }
}
function togglePause() {
  state.isPaused = !state.isPaused;
  document.getElementById('pauseButton').innerHTML = state.isPaused ? 'Resume' : 'Pause';
  console.log(state.isPaused ? "Optimization will be paused at the end of the current process!" : "Optimization is resumed...");
}

export { startButton_clicked, updateCheckboxStates, updateSubwooferLPFState, togglePause };

// ── Console → UI log bridge ──────────────────────────────────────────────────
(function () {
  const logContainer = document.getElementById('logContainer');
  function scrollToBottom() {
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  window.addEventListener('unhandledrejection', function (event) {
    const msg = event.reason && event.reason.message ? event.reason.message : String(event.reason);
    const errorEntry = `<div class="error">${new Date().toLocaleTimeString()} [ERROR!] Unhandled error: ${msg}</div>`;
    logContainer.insertAdjacentHTML('beforeend', errorEntry);
    scrollToBottom();
    document.getElementById('startButton').disabled = false;
    document.getElementById('pauseButton').disabled = true;
  });
  let lastInfoEntry = null;
  const originalWarn = console.warn;
  console.warn = function (...args) {
    const warningMessage = args.join(' ');
    const warningEntry = `<div class="warning">${new Date().toLocaleTimeString()} [WARNING!] ${warningMessage}</div>`;
    logContainer.insertAdjacentHTML('beforeend', warningEntry);
    scrollToBottom();
    originalWarn.apply(console, args);
  };
  const originalInfo = console.info;
  console.info = function (...args) {
    const infoMessage = args.join(' ');
    const infoEntry = `<div class="info">${new Date().toLocaleTimeString()} [INFORMATION] ${infoMessage}</div>`;
    logContainer.insertAdjacentHTML('beforeend', infoEntry);
    lastInfoEntry = logContainer.lastElementChild;
    scrollToBottom();
    originalInfo.apply(console, args);
  };
  console.infoUpdate = function (...args) {
    const infoMessage = args.join(' ');
    if (lastInfoEntry) {
      lastInfoEntry.innerHTML = `${new Date().toLocaleTimeString()} [INFORMATION] ${infoMessage}`;
      scrollToBottom();
    } else {
      console.info(...args);  // If there's no last info entry, create a new one
    }
    originalInfo.apply(console, args);
  };
  const originalLog = console.log;
  console.log = function (...args) {
    const logMessage = args.join(' ');
    const logEntry = `<div class="log">${new Date().toLocaleTimeString()} [IMPORTANT] ${logMessage}</div>`;
    logContainer.insertAdjacentHTML('beforeend', logEntry);
    scrollToBottom();
    originalLog.apply(console, args);
  };
  const originalError = console.error;
  console.error = function (...args) {
    const errorMessage = args.join(' ');
    const errorEntry = `<div class="error">${new Date().toLocaleTimeString()} [ERROR!] ${errorMessage}</div>`;
    logContainer.insertAdjacentHTML('beforeend', errorEntry);
    scrollToBottom();
    originalError.apply(console, args);
  };
})();
