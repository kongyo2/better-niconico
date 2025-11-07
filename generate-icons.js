import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the source SVG file
const svgPath = path.join(__dirname, 'public', 'icons', 'icon.svg');
const outputDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(svgPath)) {
  console.error(`Error: SVG file not found at ${svgPath}`);
  console.error('Please create a public/icons/icon.svg file first.');
  process.exit(1);
}

const svgContent = fs.readFileSync(svgPath, 'utf-8');
const sizes = [16, 32, 48, 128];

console.log('Generating PNG icons from SVG...');

sizes.forEach(size => {
  try {
    // Create a Resvg instance with the SVG content
    const resvg = new Resvg(svgContent, {
      fitTo: {
        mode: 'width',
        value: size,
      },
    });

    // Render to PNG
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // Write to file
    const outputPath = path.join(outputDir, `icon${size}.png`);
    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`✓ Generated ${outputPath}`);
  } catch (error) {
    console.error(`✗ Failed to generate icon${size}.png:`, error.message);
    process.exit(1);
  }
});

console.log('\n✓ All icons generated successfully!');
