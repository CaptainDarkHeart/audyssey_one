import { extractAdy, saveBaseJson, saveDeqBaseJson, compareREW } from './calibration.js';
import {
  startButton_clicked,
  updateCheckboxStates,
  updateSubwooferLPFState,
  togglePause,
} from './ui.js';

// Wire DOM event listeners (replaces inline onclick="..." attributes in HTML)
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById("fileInput");
  fileInput.addEventListener("change", extractAdy);
  document.getElementById("button1").addEventListener("click", () => fileInput.click());
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
