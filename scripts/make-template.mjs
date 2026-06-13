/**
 * One-shot: creates nexus.src.html from the current nexus.html by:
 *  1. Removing all inline onclick/onchange attributes (handled by main.js)
 *  2. Replacing the <script>…</script> block with build markers
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(ROOT, 'nexus.html'), 'utf8');

// Remove inline event handler attributes
html = html
  .replace(/ onchange="extractAdy\(event\)"/g, '')
  .replace(/ onclick="document\.getElementById\('fileInput'\)\.click\(\)"/g, '')
  .replace(/ onclick="saveDeqBaseJson\(\)"/g, '')
  .replace(/ onclick="saveBaseJson\(\)"/g, '')
  .replace(/ onclick="startButton_clicked\(\)"/g, '')
  .replace(/ onclick="togglePause\(\)"/g, '')
  .replace(/ onchange="updateCheckboxStates\('[^']+'\)"/g, '')
  .replace(/ onchange="updateSubwooferLPFState\(\)"/g, '');

// Replace the <script>…</script> block with build injection markers
html = html.replace(
  /<script>[\s\S]*?<\/script>/,
  '<!-- BUILD:SCRIPT -->\n<!-- /BUILD:SCRIPT -->'
);

fs.writeFileSync(path.join(ROOT, 'nexus.src.html'), html, 'utf8');
console.log('wrote nexus.src.html');
