const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

// Create a simple SVG with a gradient background
const createSVG = (width, height, text) => `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)"/>
  <text x="50%" y="50%" font-family="Arial" font-size="${Math.min(width, height) / 10}" fill="white" text-anchor="middle" dy=".3em">${text}</text>
</svg>
`;

async function generateAssets() {
  // Icon 1024x1024
  await sharp(Buffer.from(createSVG(1024, 1024, 'A')))
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('Created icon.png');

  // Adaptive icon 1024x1024
  await sharp(Buffer.from(createSVG(1024, 1024, 'A')))
    .png()
    .toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('Created adaptive-icon.png');

  // Splash 1284x2778 (iPhone 14 Pro Max size)
  await sharp(Buffer.from(createSVG(1284, 2778, 'Attendance')))
    .png()
    .toFile(path.join(assetsDir, 'splash.png'));
  console.log('Created splash.png');

  // Favicon 48x48
  await sharp(Buffer.from(createSVG(48, 48, 'A')))
    .png()
    .toFile(path.join(assetsDir, 'favicon.png'));
  console.log('Created favicon.png');

  console.log('All assets generated successfully!');
}

generateAssets().catch(console.error);
