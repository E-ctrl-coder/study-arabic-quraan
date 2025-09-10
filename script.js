/* script.js — fixed-layout renderer with elbow connectors */

/* ———— helpers ———— */
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return [...root.querySelectorAll(sel)]; }

/* ———— DOM ———— */
const container   = $("#diagram-container");
const nodesLayer  = $("#nodes");
const svg         = $("#connectors");
const infoPanel   = $("#info-panel");
const closeInfo   = $("#close-info");
const infoContent = $("#info-content");
const fileInput   = $("#file-input");

/* ———— interactions stubs ———— */
if (typeof window.highlightPath !== "function") window.highlightPath = function(){};

/* ———— state ———— */
let classification = [];             // loaded from JSON
let nodesById = new Map();
let childrenOf = new Map();
let parentsOf = new Map();
let NODE_WIDTH = 200;
let NODE_HEIGHT = 60;

/* ———— build maps ———— */
function buildIndexes() {
  nodesById = new Map(classification.map(n => [n.id, n]));
  childrenOf = new Map(classification.map(n => [n.id, n.children || []]));
  parentsOf = new Map();

  classification.forEach(n => {
    (n.children || []).forEach(cid => {
      parentsOf.set(cid, n.id);
      const child = nodesById.get(cid);
      if (child && child.parent == null) child.parent = n.id;
    });
  });
}

/* ———— autosize canvas ———— */
function autosize() {
  const pad = 200;
  const xs  = classification.map(n => n.x || 0);
  const ys  = classification.map(n => n.y || 0);
  const maxX = Math.max(0, ...xs) + pad;
  const maxY = Math.max(0, ...ys) + pad;

  svg.setAttribute("width",  maxX);
  svg.setAttribute("height", maxY);
  nodesLayer.style.width  = `${maxX}px`;
  nodesLayer.style.height = `${maxY}px`;
}

/* ———— measure node size (approx, then refine after first render) ———— */
function measureNode() {
  const sample = nodesLayer.querySelector(".node");
  if (!sample) return;
  const r = sample.getBoundingClientRect();
  NODE_WIDTH = r.width;
  NODE_HEIGHT = r.height;
}

/* ———— node factory ———— */
function makeNodeEl(n) {
  const div = document.createElement("div");
  div.className     = "node";
  div.dataset.id    = n.id;
  div.dataset.group = n.group;
  div.style.left    = `${n.x || 0}px`;
  div.style.top     = `${n.y || 0}px`;
  div.innerHTML     = `
    <span class="ar">${n.labelAr || ""}</span>
    <span class="en">${n.labelEn || ""}</span>
  `;
  div.addEventListener("mouseenter", () => highlightPath(n.id, true));
  div.addEventListener("mouseleave", () => highlightPath(n.id, false));
  div.addEventListener("click", e => {
    e.stopPropagation();
    focusSubtree(n.id);
    showInfo(n);
  });
  return div;
}

/* ———— elbow connectors ———— */
function drawConnectors() {
  svg.innerHTML = "";

  const svgRect   = svg.getBoundingClientRect();
  const layerRect = nodesLayer.getBoundingClientRect();
  const offsetX   = layerRect.left - svgRect.left;
  const offsetY   = layerRect.top  - svgRect.top;

  classification.forEach(n => {
    const parentId = n.parent || parentsOf.get(n.id);
    if (!parentId) return;

    const p = nodesById.get(parentId);
    const c = n;

    const x1 = offsetX + (p.x || 0) + NODE_WIDTH  / 2;
    const y1 = offsetY + (p.y || 0) + NODE_HEIGHT;
    const x2 = offsetX + (c.x || 0) + NODE_WIDTH  / 2;
    const y2 = offsetY + (c.y || 0);

    const poly = document.createElementNS(svg.namespaceURI, "polyline");
    poly.classList.add("connector", n.group);
    // Parent bottom center → horizontal to child x → vertical down/up to child top
    poly.setAttribute("points", `${x1},${y1} ${x2},${y1} ${x2},${y2}`);
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke-linecap", "round");
    poly.style.pointerEvents = "none";
    poly.dataset.parent = parentId;
    poly.dataset.child  = n.id;

    svg.appendChild(poly);
  });
}

/* ———— focus/dim ———— */
function focusSubtree(rootId) {
  const keep = new Set();
  (function down(id) {
    keep.add(id);
    (childrenOf.get(id) || []).forEach(down);
  })(rootId);
  (function up(id) {
    const p = parentsOf.get(id);
    if (p) { keep.add(p); up(p); }
  })(rootId);

  nodesLayer.querySelectorAll(".node").forEach(el => {
    const isActive = keep.has(el.dataset.id);
    el.classList.toggle("dimmed", !isActive);
    el.classList.toggle("active", el.dataset.id === rootId);
  });

  svg.querySelectorAll(".connector").forEach(line => {
    const show = keep.has(line.dataset.parent) && keep.has(line.dataset.child);
    line.classList.toggle("dimmed", !show);
  });
}

function clearFocus() {
  nodesLayer.querySelectorAll(".node").forEach(el =>
    el.classList.remove("dimmed", "active")
  );
  svg.querySelectorAll(".connector").forEach(line =>
    line.classList.remove("dimmed")
  );
}

function showInfo(n) {
  infoContent.innerHTML = `
    <h2>${n.labelAr || ""}${n.labelEn ? " | " + n.labelEn : ""}</h2>
    <p>${n.infoAr || "هنا يمكن وضع التعريفات والأمثلة."}<br/>
    ${n.infoEn || "Definitions/examples go here."}</p>
  `;
  infoPanel.classList.remove("hidden");
}

closeInfo.addEventListener("click", () => {
  infoPanel.classList.add("hidden");
});
document.addEventListener("click", e => {
  if (!infoPanel.contains(e.target)) clearFocus();
});

/* ———— render ———— */
function render() {
  buildIndexes();

  nodesLayer.innerHTML = "";
  classification.forEach(n => nodesLayer.appendChild(makeNodeEl(n)));

  // measure after first render so connector anchors are accurate
  measureNode();

  // re-apply precise positions (if measurement changed sizes)
  classification.forEach(n => {
    const el = nodesLayer.querySelector(`.node[data-id="${n.id}"]`);
    if (el) {
      el.style.left = `${n.x || 0}px`;
      el.style.top  = `${n.y || 0}px`;
    }
  });

  autosize();
  drawConnectors();
}

/* ———— data loading ———— */
async function loadDefault() {
  // Load classification.json from the same folder
  const res = await fetch("classification.json", { cache: "no-store" });
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("classification.json must be an array");
  classification = data;
  render();
}

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    alert("JSON must be an array of node objects.");
    return;
  }
  classification = data;
  render();
});

/* ———— init ———— */
loadDefault().catch(err => {
  console.error(err);
  // If no file present, start with an empty state and show a tip
  classification = [];
  render();
});
