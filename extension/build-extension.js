const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(ROOT_DIR, 'frontend');
const EXTENSION_DIR = path.resolve(ROOT_DIR, 'extension');
const BUILD_DIR = path.resolve(FRONTEND_DIR, 'build');
const DIST_DIR = path.resolve(EXTENSION_DIR, 'dist');

console.log('🔨 Building Huddle Chrome Extension...\n');

// Step 1: Build the React app
console.log('📦 Step 1: Building React app...');
try {
  // Set environment variables directly (cross-platform compatible)
  const buildEnv = { 
    ...process.env, 
    INLINE_RUNTIME_CHUNK: 'false',  // Don't inline scripts (CSP requirement)
    GENERATE_SOURCEMAP: 'false',     // No sourcemaps for extension
    PUBLIC_URL: '.',                 // Use relative paths
    CI: 'false'
  };
  
  // Use npx react-scripts build directly to avoid CI= prefix issue on Windows
  execSync('npx react-scripts build', { 
    cwd: FRONTEND_DIR, 
    stdio: 'inherit',
    env: buildEnv
  });
  console.log('✅ React build complete!\n');
} catch (error) {
  console.error('❌ React build failed:', error.message);
  process.exit(1);
}

// Step 2: Prepare extension dist directory
console.log('📂 Step 2: Preparing extension dist folder...');
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// Step 3: Copy extension files
console.log('📋 Step 3: Copying extension manifest and background script...');
const extensionFiles = ['manifest.json', 'background.js'];
extensionFiles.forEach(file => {
  const src = path.join(EXTENSION_DIR, file);
  const dest = path.join(DIST_DIR, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`   ✅ ${file}`);
  } else {
    console.warn(`   ⚠️  ${file} not found, skipping`);
  }
});

// Step 4: Copy icons
console.log('📋 Step 4: Copying icons...');
const iconsDir = path.join(EXTENSION_DIR, 'icons');
const distIconsDir = path.join(DIST_DIR, 'icons');
if (fs.existsSync(iconsDir)) {
  fs.mkdirSync(distIconsDir, { recursive: true });
  fs.readdirSync(iconsDir).forEach(file => {
    fs.copyFileSync(path.join(iconsDir, file), path.join(distIconsDir, file));
    console.log(`   ✅ icons/${file}`);
  });
} else {
  console.log('   ⚠️  No icons directory found - generating placeholder icons');
  generatePlaceholderIcons(distIconsDir);
}

// Step 5: Copy React build output
console.log('📋 Step 5: Copying React build output...');
copyDirSync(BUILD_DIR, DIST_DIR);

// Step 6: Create sidepanel.html that references the built assets
console.log('📋 Step 6: Creating sidepanel.html...');
createSidePanelHtml();

// Step 7: Update manifest to point to correct paths
console.log('📋 Step 7: Verifying manifest...');
verifyManifest();

console.log('\n🎉 Extension build complete!');
console.log(`📁 Output: ${DIST_DIR}`);
console.log('\n📝 To load the extension:');
console.log('   1. Open chrome://extensions/');
console.log('   2. Enable "Developer mode"');
console.log('   3. Click "Load unpacked"');
console.log(`   4. Select: ${DIST_DIR}`);
console.log('   5. Click the Huddle icon → opens as side panel!');

// --- Helper functions ---

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirSync(srcPath, destPath);
    } else {
      // Skip index.html from build (we create our own sidepanel.html)
      if (entry.name === 'index.html' && src === BUILD_DIR) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function createSidePanelHtml() {
  // Read the built index.html to extract CSS/JS references
  const indexHtmlPath = path.join(BUILD_DIR, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.error('❌ Build index.html not found!');
    process.exit(1);
  }

  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  
  // Replace absolute paths with relative paths
  indexHtml = indexHtml.replace(/href="\//g, 'href="./');
  indexHtml = indexHtml.replace(/src="\//g, 'src="./');
  
  // Replace the title
  indexHtml = indexHtml.replace(
    /<title>.*?<\/title>/,
    '<title>Huddle - AI Meeting Platform</title>'
  );

  // Add extension-specific meta and styles
  const extensionStyles = `
    <style>
      body { width: 100%; min-width: 0; overflow-x: hidden; margin: 0; padding: 0; }
      #root { width: 100%; min-height: 100vh; }
    </style>`;
  
  indexHtml = indexHtml.replace('</head>', `${extensionStyles}\n</head>`);

  fs.writeFileSync(path.join(DIST_DIR, 'sidepanel.html'), indexHtml);
  // Also keep as index.html for compatibility
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml);
  console.log('   ✅ sidepanel.html created from build output');
}

function verifyManifest() {
  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Ensure sidepanel.html exists
  const sidePanelPath = path.join(DIST_DIR, manifest.side_panel.default_path);
  if (!fs.existsSync(sidePanelPath)) {
    console.error(`❌ Side panel file not found: ${manifest.side_panel.default_path}`);
    process.exit(1);
  }
  
  // Ensure icons exist (create placeholders if not)
  const iconSizes = ['16', '32', '48', '128'];
  iconSizes.forEach(size => {
    const iconPath = path.join(DIST_DIR, `icons/icon${size}.png`);
    if (!fs.existsSync(iconPath)) {
      console.warn(`   ⚠️  Missing icon: icons/icon${size}.png (generating placeholder)`);
      generateSingleIcon(iconPath, parseInt(size));
    }
  });
  
  console.log('   ✅ Manifest verified');
}

function generatePlaceholderIcons(dir) {
  fs.mkdirSync(dir, { recursive: true });
  [16, 32, 48, 128].forEach(size => {
    generateSingleIcon(path.join(dir, `icon${size}.png`), size);
  });
}

function generateSingleIcon(filePath, size) {
  // Generate a minimal valid PNG with a blue gradient circle
  // This is a simple 1x1 blue pixel PNG scaled - replace with real icons later
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A  // PNG signature
  ]);
  
  // For simplicity, create a minimal valid PNG
  // In production, replace with actual designed icons
  const { createCanvas } = (() => {
    try {
      return require('canvas');
    } catch {
      return { createCanvas: null };
    }
  })();

  if (createCanvas) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Blue gradient background with rounded corners
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#3B82F6');
    gradient.addColorStop(0.5, '#7C3AED');
    gradient.addColorStop(1, '#4F46E5');
    
    ctx.fillStyle = gradient;
    const radius = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.fill();
    
    // "H" letter
    ctx.fillStyle = 'white';
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', size / 2, size / 2);
    
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
  } else {
    // Create a minimal 1x1 PNG as fallback (user should replace with real icons)
    // Minimal valid PNG: 8-byte signature + IHDR + IDAT + IEND
    const minimalPng = createMinimalPng(size);
    fs.writeFileSync(filePath, minimalPng);
  }
  console.log(`   ✅ Generated placeholder icon${size}.png`);
}

function createMinimalPng(size) {
  // Create a minimal valid PNG file
  const zlib = require('zlib');
  
  const width = size;
  const height = size;
  
  // Create raw image data (RGBA)
  const rawData = Buffer.alloc(height * (1 + width * 4)); // filter byte + RGBA per pixel
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // No filter
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 4) + 1 + x * 4;
      // Blue-purple gradient
      const t = (x + y) / (width + height);
      rawData[offset] = Math.round(59 + t * 20);     // R
      rawData[offset + 1] = Math.round(130 - t * 70); // G
      rawData[offset + 2] = Math.round(246 - t * 20);  // B
      rawData[offset + 3] = 255;                       // A
    }
  }
  
  const compressed = zlib.deflateSync(rawData);
  
  // Build PNG
  const chunks = [];
  
  // Signature
  chunks.push(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(createPngChunk('IHDR', ihdr));
  
  // IDAT
  chunks.push(createPngChunk('IDAT', compressed));
  
  // IEND
  chunks.push(createPngChunk('IEND', Buffer.alloc(0)));
  
  return Buffer.concat(chunks);
}

function createPngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
