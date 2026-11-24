// Renders the app icons with a headless browser canvas.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas id=c></canvas>");
const sizes = { "icon-512.png": 512, "icon-192.png": 192, "apple-touch-icon.png": 180, "icon-32.png": 32 };
for (const [name, size] of Object.entries(sizes)) {
  const data = await page.evaluate((S) => {
    const c = document.getElementById("c");
    c.width = c.height = S;
    const g = c.getContext("2d");
    g.scale(S / 512, S / 512);
    const bg = g.createRadialGradient(256, 330, 20, 256, 300, 360);
    bg.addColorStop(0, "#ff9a2a");
    bg.addColorStop(0.25, "#a8360c");
    bg.addColorStop(0.6, "#2a0e06");
    bg.addColorStop(1, "#0a0604");
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 512);
    // embers
    for (let i = 0; i < 40; i++) {
      const x = 80 + ((i * 97) % 360), y = 120 + ((i * 53) % 320), r = 2 + (i % 4);
      g.fillStyle = `rgba(255,${150 + (i % 5) * 20},60,${0.25 + (i % 3) * 0.2})`;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    // crossed axe and sword
    g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = "#120806"; g.lineWidth = 12;
    const sword = () => {
      g.save(); g.translate(256, 256); g.rotate(Math.PI / 4);
      g.fillStyle = "#d8dde2";
      g.beginPath(); g.moveTo(-18, 70); g.lineTo(-18, -150); g.lineTo(0, -190); g.lineTo(18, -150); g.lineTo(18, 70); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#c8a040"; g.fillRect(-60, 70, 120, 26); g.strokeRect(-60, 70, 120, 26);
      g.fillStyle = "#4a2a14"; g.fillRect(-14, 96, 28, 70); g.strokeRect(-14, 96, 28, 70);
      g.fillStyle = "#c8a040"; g.beginPath(); g.arc(0, 180, 20, 0, 7); g.fill(); g.stroke();
      g.restore();
    };
    const axe = () => {
      g.save(); g.translate(256, 256); g.rotate(-Math.PI / 4);
      g.fillStyle = "#7a4e2a"; g.fillRect(-14, -170, 28, 360); g.strokeRect(-14, -170, 28, 360);
      g.fillStyle = "#b9c0c7";
      g.beginPath(); g.moveTo(10, -160); g.quadraticCurveTo(140, -190, 150, -40); g.quadraticCurveTo(80, -70, 10, -50); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-10, -160); g.quadraticCurveTo(-140, -190, -150, -40); g.quadraticCurveTo(-80, -70, -10, -50); g.closePath(); g.fill(); g.stroke();
      g.restore();
    };
    axe(); sword();
    return c.toDataURL("image/png").split(",")[1];
  }, size);
  writeFileSync(`public/icons/${name}`, Buffer.from(data, "base64"));
}
await browser.close();
console.log("icons done");
