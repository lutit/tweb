// @ts-check

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

/**
 * Recursively copy directory contents.
 * Existing files are overwritten, other contents in target are preserved.
 * @param {string} source
 * @param {string} destination
 */
function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) {
    return;
  }

  const stat = fs.statSync(source);
  if (!stat.isDirectory()) {
    return;
  }

  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, {recursive: true});
  }

  const entries = fs.readdirSync(source, {withFileTypes: true});
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureDistExists() {
  if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
    console.error('syncPublicToDist: dist/ does not exist, run build first');
    process.exit(1);
  }
}

function main() {
  ensureDistExists();

  const subdirs = ['assets', 'custom-lang', 'changelogs'];
  const rootFiles = [
    '_redirects',
    '_headers',
    '404.html',
    'recorder.min.js',
    'decoderWorker.min.js',
    'encoderWorker.min.js',
    'waveWorker.min.js'
  ];
  const rootExtensions = ['.wasm'];

  for (const dir of subdirs) {
    const src = path.join(publicDir, dir);
    if (!fs.existsSync(src)) {
      continue;
    }

    // Copy only well-known static dirs from public to dist
    const dest = path.join(distDir, dir);
    console.log(`syncPublicToDist: copying ${src} -> ${dest}`);
    copyDirectory(src, dest);
  }

  for (const file of rootFiles) {
    const src = path.join(publicDir, file);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      continue;
    }

    const dest = path.join(distDir, file);
    console.log(`syncPublicToDist: copying ${src} -> ${dest}`);
    fs.copyFileSync(src, dest);
  }

  const rootEntries = fs.readdirSync(publicDir, {withFileTypes: true});
  for (const entry of rootEntries) {
    if (!entry.isFile()) {
      continue;
    }

    if (!rootExtensions.some((ext) => entry.name.endsWith(ext))) {
      continue;
    }

    const src = path.join(publicDir, entry.name);
    const dest = path.join(distDir, entry.name);
    console.log(`syncPublicToDist: copying ${src} -> ${dest}`);
    fs.copyFileSync(src, dest);
  }
}

main();
