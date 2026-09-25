/** Render the app icon SVG to the PNG sizes browsers and iOS need. */
import sharp from "sharp";
const svg = await (await import("node:fs/promises")).readFile("public/icon.svg");
await sharp(svg).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(svg).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(svg).resize(180, 180).flatten({ background: "#3b5bdb" }).png().toFile("public/apple-touch-icon.png");
// Maskable: keep the glyph inside the central safe zone (80%).
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#3b5bdb" } })
  .composite([{ input: await sharp(svg).resize(410, 410).png().toBuffer(), gravity: "center" }])
  .png()
  .toFile("public/icon-maskable-512.png");
console.log("icons written");
