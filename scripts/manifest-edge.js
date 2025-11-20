// scripts/manifest-edge.js
const fs = require('fs');
const path = require('path');

console.log('\n🟦 Building for Microsoft Edge...\n');

const manifestPath = path.join(__dirname, '../dist/manifest.json');

// Ensure dist folder exists
const distPath = path.join(__dirname, '../dist');
if (!fs.existsSync(distPath)) {
  console.error('❌ Error: dist folder not found');
  console.log('   Creating dist folder...');
  fs.mkdirSync(distPath, { recursive: true });
}

// Ensure manifest.json exists
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
  const content = fs.readFileSync(manifestPath, 'utf8');
  manifest = JSON.parse(content);
  console.log('✅ Manifest loaded successfully\n');
} catch (err) {
  console.error('❌ Error reading manifest.json:', err.message);
  process.exit(1);
}

console.log('🔧 Applying Microsoft Edge modifications...\n');

// 1. ❌ Remove Firefox-specific browser settings
if (manifest.browser_specific_settings && manifest.browser_specific_settings.gecko) {
  delete manifest.browser_specific_settings.gecko;
  console.log('   ✅ Removed Firefox browser_specific_settings.gecko');
}

// 2. Remove entire browser_specific_settings if empty
if (
  manifest.browser_specific_settings &&
  Object.keys(manifest.browser_specific_settings).length === 0
) {
  delete manifest.browser_specific_settings;
  console.log('   ✅ Removed empty browser_specific_settings');
}

// 3. Edge fully supports Manifest V3 → keep service_worker
console.log('   ✅ Keeping service_worker (Edge supports MV3)');

// 4. Edge supports the debugger permission → keep
if (manifest.permissions?.includes('debugger')) {
  console.log('   ✅ Debugger permission kept (Edge supports it)');
}

// 5. Side panel is supported in Edge → keep
console.log('   ✅ Side panel kept');

// 6. No special changes required for CSP/incognito

// Save the updated manifest
try {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('\n✅ Edge manifest saved successfully!');
  console.log(`📦 Location: ${manifestPath}\n`);
} catch (error) {
  console.error('❌ Error writing manifest.json:', error.message);
  process.exit(1);
}

// Summary
console.log('📋 Summary of changes for Edge:');
console.log('   - Removed Firefox-specific keys');
console.log('   - Kept Manifest V3 service_worker');
console.log('   - Kept debugger permission');
console.log('   - Kept side_panel');
console.log('\n📝 Next steps:');
console.log('   Load into Edge:');
console.log('      1. Go to edge://extensions');
console.log('      2. Enable "Developer mode"');
console.log('      3. Click “Load unpacked” and select /dist folder\n');
