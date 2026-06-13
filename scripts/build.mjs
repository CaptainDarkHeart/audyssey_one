/**
 * Bundles src/main.js with esbuild and injects the result into nexus.html,
 * replacing the <!-- BUILD:SCRIPT --> … <!-- /BUILD:SCRIPT --> comment block.
 *
 * Usage:
 *   node scripts/build.mjs           # one-shot build
 *   node scripts/build.mjs --watch   # rebuild on src/ changes
 */
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ENTRY = path.join(ROOT, 'src', 'main.js');
const HTML_TEMPLATE = path.join(ROOT, 'nexus.src.html');
const HTML_OUT = path.join(ROOT, 'nexus.html');
const README = path.join(ROOT, 'README.md');
const WATCH = process.argv.includes('--watch');

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const SCRIPT_START = '<!-- BUILD:SCRIPT -->';
const SCRIPT_END   = '<!-- /BUILD:SCRIPT -->';
const VERSION_MARKER = '<!-- BUILD:VERSION -->';

async function injectScript(bundledJs) {
  let html = fs.readFileSync(HTML_TEMPLATE, 'utf8');
  const start = html.indexOf(SCRIPT_START);
  const end   = html.indexOf(SCRIPT_END);
  if (start === -1 || end === -1) {
    throw new Error(`nexus.src.html must contain ${SCRIPT_START} and ${SCRIPT_END} markers`);
  }
  const injected = (
    html.slice(0, start) +
    SCRIPT_START + '\n<script>\n' +
    bundledJs +
    '\n</script>\n' +
    SCRIPT_END +
    html.slice(end + SCRIPT_END.length)
  ).replaceAll(VERSION_MARKER, version);
  fs.writeFileSync(HTML_OUT, injected, 'utf8');

  // Keep README version in sync
  const readme = fs.readFileSync(README, 'utf8');
  const updatedReadme = readme.replace(
    /\[A1 Evo Nexus [^\]]*\]/,
    `[A1 Evo Nexus ${version}]`
  );
  if (updatedReadme !== readme) {
    fs.writeFileSync(README, updatedReadme, 'utf8');
  }

  console.log(`[build] nexus.html updated (${(injected.length / 1024).toFixed(0)} KB) — v${version}`);
}

const buildOptions = {
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  minify: false,
  write: false,
  logLevel: 'info',
  define: { __VERSION__: JSON.stringify(version) },
};

if (WATCH) {
  const ctx = await esbuild.context({
    ...buildOptions,
    plugins: [{
      name: 'html-inject',
      setup(build) {
        build.onEnd(async result => {
          if (result.errors.length === 0) {
            const js = result.outputFiles[0].text;
            await injectScript(js);
          }
        });
      },
    }],
  });
  await ctx.watch();
  console.log('[build] watching src/ for changes…');
} else {
  const result = await esbuild.build(buildOptions);
  if (result.errors.length > 0) process.exit(1);
  const js = result.outputFiles[0].text;
  await injectScript(js);
}
