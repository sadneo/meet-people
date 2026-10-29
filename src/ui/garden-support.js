const gardenShop = [
  ["garnet", "Garnet", 300],
  ["sapphire", "Sapphire", 300],
  ["emerald", "Emerald", 300],
  ["citrine", "Citrine", 300],
  ["river", "River", 80],
  ["tree", "Tree Cluster", 60],
  ["walkway", "Walkway", 45],
  ["meadow", "Flower Meadow", 25],
  ["shrub", "Shrub Patch", 30],
  ["rock", "Rock Formation", 35],
  ["grass", "Grass Details", 20],
  ["wildflowers", "Wildflower Patch", 10],
  ["bench", "Garden Bench", 15],
  ["lanterns", "Path Lanterns", 20],
  ["picnic", "Picnic Spot", 25],
  ["bridge", "Footbridge", 30],
  ["vegetables", "Community Garden", 40],
  ["cafe", "Café Cart", 55],
  ["stage", "Music Stage", 70],
  ["cottage", "Cottage Expansion", 90],
  ["hall", "Community Hall", 120],
];
const gardenSpriteFrames = {
  currency: [315, 1069, 176, 146],
  garnet: [55, 90, 200, 190],
  sapphire: [300, 90, 195, 190],
  emerald: [540, 90, 195, 190],
  citrine: [775, 90, 195, 190],
  river: [1000, 80, 225, 230],
  tree: [35, 310, 230, 235],
  walkway: [285, 315, 225, 230],
  meadow: [510, 350, 240, 195],
  shrub: [750, 345, 230, 200],
  rock: [995, 345, 235, 200],
  grass: [40, 560, 220, 210],
  wildflowers: [285, 570, 225, 200],
  bench: [515, 570, 225, 200],
  lanterns: [760, 560, 225, 210],
  picnic: [995, 575, 235, 195],
  bridge: [40, 800, 230, 200],
  vegetables: [285, 800, 225, 200],
  cafe: [520, 780, 225, 220],
  stage: [760, 790, 225, 210],
  cottage: [995, 790, 235, 210],
  hall: [35, 1015, 230, 190],
  pebble: [300, 1020, 200, 185],
};
const gardenCategories = [
  ["Rare Finds", 0, 4],
  ["Landscape", 4, 11],
  ["Village Decorations", 11, 21],
];
// Render the reference atlas at a deliberately low logical resolution, then upscale without smoothing.
const gardenAtlasImage = document.createElement("img");
gardenAtlasImage.onload = () => paintGardenSprites();
gardenAtlasImage.src = "/pebble/garden-sprites-v1.png";
function paintGardenSprites(root = document) {
  if (!gardenAtlasImage.complete || !gardenAtlasImage.naturalWidth) return;
  root.querySelectorAll("canvas[data-garden-sprite]").forEach((canvas) => {
    if (canvas.dataset.painted) return;
    const frame =
        gardenSpriteFrames[canvas.dataset.gardenSprite] ||
        gardenSpriteFrames.pebble,
      scale = gardenAtlasImage.naturalWidth / 1280,
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = Math.min(canvas.width / frame[2], canvas.height / frame[3]),
      w = Math.round(frame[2] * ratio),
      h = Math.round(frame[3] * ratio);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      gardenAtlasImage,
      frame[0] * scale,
      frame[1] * scale,
      frame[2] * scale,
      frame[3] * scale,
      Math.floor((canvas.width - w) / 2),
      Math.floor((canvas.height - h) / 2),
      w,
      h,
    );
    canvas.dataset.painted = "true";
  });
}
function gardenSprite(id, cls = "") {
  const motion = [
      "pebble",
      "garnet",
      "sapphire",
      "emerald",
      "citrine",
    ].includes(id)
      ? "breathe"
      : [
            "tree",
            "shrub",
            "grass",
            "meadow",
            "wildflowers",
            "vegetables",
          ].includes(id)
        ? "wind"
        : id === "river"
          ? "water"
          : "",
    size =
      motion === "breathe" || id === "currency"
        ? 32
        : [
              "tree",
              "shrub",
              "grass",
              "meadow",
              "wildflowers",
              "vegetables",
              "rock",
            ].includes(id)
          ? 40
          : 48;
  return `<span class="garden-sprite ${cls}" data-kind="${id}" data-motion="${motion}" aria-hidden="true"><canvas width="${size}" height="${size}" data-garden-sprite="${id}" data-atlas="/pebble/garden-sprites-v1.png"></canvas></span>`;
}

function gardenBuildCatalog() {
  return gardenCategories
    .map(
      ([category, start, end]) =>
        `<section class="garden-catalog-category"><h3>${category}</h3>${gardenShop
          .slice(start, end)
          .map(
            ([id, name, cost]) =>
              `<div class="builditem"><div class="row"><span class="garden-shop-art">${gardenSprite(id)}</span><div><b>${name}</b><br><small>${cost} Pebbles${S.decor.some((x) => x.icon === id) ? " · Owned" : ""}</small></div></div><button class="btn light small" ${S.balance < cost ? "disabled" : ""} onclick="SkyGarden.purchase(${gardenShop.findIndex((item) => item[0] === id)})">${S.balance < cost ? "Need " + (cost - S.balance) : "Build"}</button></div>`,
          )
          .join("")}</section>`,
    )
    .join("");
}
export let S = {
  balance: 240,
  decor: [],
  day: 6,
  connections: [],
  blocked: [],
  removedConnections: [],
};
export function bindGarden(next) {
  S = next;
}
export const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const modal = document.createElement("dialog");
modal.className = "account-modal";
modal.setAttribute("aria-label", "Garden");
document.body.appendChild(modal);
window.gardenDialog = modal;
export function btn(label, action, cls = "") {
  return `<button class="btn ${cls}" onclick="${action.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">${label}</button>`;
}
export function show(title, body) {
  modal.innerHTML = `<h2>${title}</h2>${body}`;
  modal.showModal();
}
export function toast(message) {
  const node = document.querySelector("#garden-status");
  if (node) node.textContent = message;
}
export { gardenShop, gardenSprite, gardenBuildCatalog, paintGardenSprites };
