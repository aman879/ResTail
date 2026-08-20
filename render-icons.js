import sharp from 'sharp';
import fs from 'fs';

const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" fill="none">
  <!-- Outer Stroke / Border (White) -->
  <path d="M248,152a8,8,0,0,1-8,8H224v16a8,8,0,0,1-16,0V160H192a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,248,152ZM56,72H72V88a8,8,0,0,0,16,0V72h16a8,8,0,0,0,0-16H88V40a8,8,0,0,0-16,0V56H56a8,8,0,0,0,0,16ZM184,192h-8v-8a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0v-8h8a8,8,0,0,0,0-16ZM219.31,80,80,219.31a16,16,0,0,1-22.62,0L36.68,198.63a16,16,0,0,1,0-22.63L176,36.69a16,16,0,0,1,22.63,0l20.68,20.68A16,16,0,0,1,219.31,80ZM208,68.69,187.31,48l-32,32L176,100.69Z"
        fill="#ffffff"
        stroke="#ffffff"
        stroke-width="16"
        stroke-linejoin="round"
        stroke-linecap="round" />
  <!-- Inner Fill (Black) -->
  <path d="M248,152a8,8,0,0,1-8,8H224v16a8,8,0,0,1-16,0V160H192a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,248,152ZM56,72H72V88a8,8,0,0,0,16,0V72h16a8,8,0,0,0,0-16H88V40a8,8,0,0,0-16,0V56H56a8,8,0,0,0,0,16ZM184,192h-8v-8a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0v-8h8a8,8,0,0,0,0-16ZM219.31,80,80,219.31a16,16,0,0,1-22.62,0L36.68,198.63a16,16,0,0,1,0-22.63L176,36.69a16,16,0,0,1,22.63,0l20.68,20.68A16,16,0,0,1,219.31,80ZM208,68.69,187.31,48l-32,32L176,100.69Z"
        fill="#09090b" />
</svg>
`;

async function main() {
  const svgBuffer = Buffer.from(svgContent);
  const sizes = [16, 32, 48, 128];
  
  if (!fs.existsSync('public/icons')) {
    fs.mkdirSync('public/icons', { recursive: true });
  }

  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(`public/icons/icon-${size}.png`);
    console.log(`Successfully generated icon-${size}.png`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
