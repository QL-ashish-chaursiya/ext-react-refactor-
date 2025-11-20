// scripts/manifest-firefox.js
const fs = require('fs');
const path = require('path');

console.log('\n🦊 Building for Firefox...\n');

const manifestPath = path.join(__dirname, '../dist/manifest.json');

// Check if dist folder exists
const distPath = path.join(__dirname, '../dist');
if (!fs.existsSync(distPath)) {
  console.error('❌ Error: dist folder not found');
  console.log('   Creating dist folder...');
  fs.mkdirSync(distPath, { recursive: true });
}

// Check if manifest exists
if (!fs.existsSync(manifestPath)) {
  console.error('❌ Error: manifest.json not found in dist folder');
  console.log('   Copying from root...');
  
  const rootManifestPath = path.join(__dirname, '../manifest.json');
  if (fs.existsSync(rootManifestPath)) {
    fs.copyFileSync(rootManifestPath, manifestPath);
    console.log('   ✅ Manifest copied to dist/');
  } else {
    console.error('   ❌ manifest.json not found in root either!');
    process.exit(1);
  }
}

console.log(`📂 Reading manifest from: ${manifestPath}`);

let manifest;
try {
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  manifest = JSON.parse(manifestContent);
  console.log('✅ Manifest loaded successfully\n');
} catch (error) {
  console.error('❌ Error reading manifest.json:', error.message);
  process.exit(1);
}

// Firefox-specific adjustments
console.log('🔧 Applying Firefox modifications...\n');

// 1. Remove debugger permission
if (manifest.permissions) {
  const hadDebugger = manifest.permissions.includes('debugger');
  manifest.permissions = manifest.permissions.filter(p => p !== 'debugger');
  if (hadDebugger) {
    console.log('   ✅ Removed debugger permission');
  }
}

// 2. Firefox uses background.scripts instead of service_worker
if (manifest.background) {
  console.log('   ✅ Changed background from service_worker to scripts');
  manifest.background = {
    scripts: ['background.bundle.js'],
    type: 'module'
  };
}

// 3. Remove side_panel (not supported in Firefox)
if (manifest.side_panel) {
  delete manifest.side_panel;
  console.log('   ✅ Removed side_panel (not supported)');
}

// 4. Remove Chrome-specific keys
if (manifest.minimum_chrome_version) {
  delete manifest.minimum_chrome_version;
  console.log('   ✅ Removed minimum_chrome_version');
}

// 5. Ensure browser_specific_settings for Firefox
if (!manifest.browser_specific_settings) {
  manifest.browser_specific_settings = {};
}

manifest.browser_specific_settings.gecko = {
  id: 'evertest@evertest.co',
  strict_min_version: '109.0'
};
console.log('   ✅ Added Firefox browser_specific_settings');

// 6. Set incognito mode
manifest.incognito = 'spanning';
console.log('   ✅ Set incognito mode to spanning');

// Save the manifest
try {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('\n✅ Firefox manifest saved successfully!');
  console.log(`📦 Location: ${manifestPath}\n`);
} catch (error) {
  console.error('❌ Error writing manifest.json:', error.message);
  process.exit(1);
}

// Display summary
console.log('📋 Summary of changes:');
console.log('   🔑 Features:');
console.log('      - Debugger API: ❌ disabled (use fallback methods)');
console.log('      - Background Scripts: ✅ enabled');
console.log('      - Side Panel: ❌ removed (not supported)');
console.log('      - Incognito: ✅ spanning');
console.log('      - WebNavigation: ✅ enabled');
console.log('\n📝 Next steps:');
console.log('   Option A - Manual load:');
console.log('      1. Go to about:debugging#/runtime/this-firefox');
console.log('      2. Click "Load Temporary Add-on"');
console.log('      3. Select dist/manifest.json\n');
 