// extract-svg.js
// Usage: node extract-svg.js path/to/slide.svg > classification.json

import fs from "fs";
import { JSDOM } from "jsdom";

if (process.argv.length < 3) {
  console.error("Usage: node extract-svg.js path/to/slide.svg");
  process.exit(1);
}

const svgPath = process.argv[2];
const svgContent = fs.readFileSync(svgPath, "utf8");
const dom = new JSDOM(svgContent, { contentType: "image/svg+xml" });
const doc = dom.window.document;

const nodes = [];

// This assumes each node is a <g> group with a <rect> and <text> children
doc.querySelectorAll("g").forEach((g, idx) => {
  const rect = g.querySelector("rect");
  const textEls = [...g.querySelectorAll("text")];
  if (!rect || textEls.length === 0) return;

  const x = parseFloat(rect.getAttribute("x") || rect.getAttribute("cx") || 0);
  const y = parseFloat(rect.getAttribute("y") || rect.getAttribute("cy") || 0);

  // Combine all text lines
  const textContent = textEls.map(t => t.textContent.trim()).filter(Boolean);
  const labelAr = textContent[0] || "";
  const labelEn = textContent[1] || "";

  nodes.push({
    id: `node${idx + 1}`, // temporary ID, you'll match to your taxonomy later
    labelAr,
    labelEn,
    group: "", // fill in manually
    x,
    y,
    children: []
  });
});

console.log(JSON.stringify(nodes, null, 2));
