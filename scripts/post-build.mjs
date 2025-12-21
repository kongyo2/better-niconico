/**
 * Post-build script to inject ffmpeg-core2.js into manifest content_scripts
 * This is needed because crxjs doesn't handle static JS files in content_scripts
 */

import fs from 'fs';
import path from 'path';

const distDir = './dist';
const manifestPath = path.join(distDir, 'manifest.json');

// Read manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// Find the nicovideo content script entry
const contentScript = manifest.content_scripts?.find(
    cs => cs.matches?.some(m => m.includes('nicovideo.jp'))
);

if (contentScript) {
    // Prepend ffmpeg-core2.js to the js array
    if (!contentScript.js.includes('ffmpeg/ffmpeg-core2.js')) {
        contentScript.js.unshift('ffmpeg/ffmpeg-core2.js');
        console.log('[post-build] Added ffmpeg-core2.js to content_scripts');
    }
}

// Remove scripting permission if present (not needed with direct content script)
if (manifest.permissions?.includes('scripting')) {
    manifest.permissions = manifest.permissions.filter(p => p !== 'scripting');
    console.log('[post-build] Removed scripting permission');
}

// Write updated manifest
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('[post-build] Manifest updated successfully');
