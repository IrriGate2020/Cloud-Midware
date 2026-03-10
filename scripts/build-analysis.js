#!/usr/bin/env node

/**
 * Build script for TagoIO Analysis files
 * 
 * This script:
 * 1. Compiles TypeScript files from src/analysis
 * 2. Transforms compiled JS to use TagoIO's global Utils.tagoio instead of require()
 * 3. Outputs .tago.js files ready for upload to TagoIO
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ANALYSIS_FILES = [
  'createAlert',
  'alertAnalysis',
  'timerDuration'
];

const SRC_DIR = path.join(__dirname, '..', 'src', 'analysis');
const BUILD_DIR = path.join(__dirname, '..', 'build');

// Ensure build directory exists
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

console.log('🔨 Building TagoIO Analysis files...\n');

// Build each analysis file
ANALYSIS_FILES.forEach(fileName => {
  const srcFile = path.join(SRC_DIR, `${fileName}.ts`);
  const jsFile = path.join(BUILD_DIR, `${fileName}.js`);
  const tagoFile = path.join(BUILD_DIR, `${fileName}.tago.js`);
  
  console.log(`📦 Building ${fileName}...`);
  
  try {
    // 1. Compile TypeScript to JavaScript
    console.log(`   - Compiling TypeScript...`);
    execSync(
      `tsc ${srcFile} --outDir ${BUILD_DIR} --esModuleInterop --resolveJsonModule --moduleResolution node --target ES2017 --module commonjs`,
      { stdio: 'pipe' }
    );
    
    // 2. Read compiled JS
    let jsContent = fs.readFileSync(jsFile, 'utf8');
    
    // 3. Transform imports to use Utils.tagoio
    console.log(`   - Transforming for TagoIO runtime...`);
    
    // Replace: const sdk_1 = require("@tago-io/sdk");
    // With: const { Resources } = Utils.tagoio;
    jsContent = jsContent.replace(
      /const sdk_\d+ = require\("@tago-io\/sdk"\);?/g,
      'const { Resources } = Utils.tagoio;'
    );
    
    // Replace: new sdk_1.Resources
    // With: new Resources
    jsContent = jsContent.replace(
      /new sdk_\d+\.Resources/g,
      'new Resources'
    );
    
    // Replace: sdk_1.Resources
    // With: Resources
    jsContent = jsContent.replace(
      /sdk_\d+\.Resources/g,
      'Resources'
    );
    
    // Also handle Object.defineProperty exports pattern
    jsContent = jsContent.replace(
      /Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);?\n?/g,
      ''
    );
    
    // Remove exports.functionName = functionName;
    jsContent = jsContent.replace(
      /exports\.\w+ = \w+;?\n?/g,
      ''
    );
    
    // 4. Write .tago.js file
    fs.writeFileSync(tagoFile, jsContent);
    
    // 5. Clean up intermediate .js file
    fs.unlinkSync(jsFile);
    
    console.log(`   ✅ Created ${fileName}.tago.js\n`);
    
  } catch (error) {
    console.error(`   ❌ Error building ${fileName}:`, error.message);
    process.exit(1);
  }
});

console.log('✨ Build complete! Files ready for upload to TagoIO:');
ANALYSIS_FILES.forEach(fileName => {
  console.log(`   - build/${fileName}.tago.js`);
});
