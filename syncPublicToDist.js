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
}

main();

