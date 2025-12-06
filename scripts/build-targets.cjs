const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const bundleDir = path.join(root, "dist", "bundle");
const chromeDir = path.join(root, "dist", "chrome");
const firefoxDir = path.join(root, "dist", "firefox");
const iconsDir = path.join(root, "icons");

const target = process.argv[2] || "all"; // "all" | "chrome" | "firefox"



function rimraf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}



function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source dir does not exist: ${src}`);
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}



function buildChrome() {
  console.log("[build] Preparing dist/chrome");
  rimraf(chromeDir);
  copyDir(bundleDir, chromeDir);

  // manifest specifico
  fs.copyFileSync(
    path.join(root, "manifest.chrome.json"),
    path.join(chromeDir, "manifest.json")
  );

  // icone
  if (fs.existsSync(iconsDir)) {
    copyDir(iconsDir, path.join(chromeDir, "icons"));
  }
}



function buildFirefox() {
  console.log("[build] Preparing dist/firefox");
  rimraf(firefoxDir);
  copyDir(bundleDir, firefoxDir);

  // manifest specifico
  fs.copyFileSync(
    path.join(root, "manifest.firefox.json"),
    path.join(firefoxDir, "manifest.json")
  );

  // icone
  if (fs.existsSync(iconsDir)) {
    copyDir(iconsDir, path.join(firefoxDir, "icons"));
  }
}



if (target === "all" || target === "chrome") {
  buildChrome();
}
if (target === "all" || target === "firefox") {
  buildFirefox();
}

console.log("[build] Done:", target);
