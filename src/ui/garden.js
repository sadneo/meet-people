import {
  bindGarden,
  gardenShop,
  gardenSprite,
  gardenBuildCatalog,
  paintGardenSprites,
  esc,
  show,
  btn,
  modal,
  toast,
} from "./garden-support.js";
/* Original square garden artwork with a free camera and independently placed purchases. Fixture progress only. */
export const SkyGarden = (() => {
  const camera = { x: 0, y: 80, zoom: 0.5 },
    assets = {},
    pointers = new Map(),
    undo = [];
  let state,
    stage,
    canvas,
    context,
    frame = 0,
    previousTime = 0,
    gesture = null,
    selected = -1,
    placing = false,
    arranging = false,
    sheet = "",
    time = 0,
    initialized = false,
    resizeObserver = null,
    view = "overview",
    pausedAt = 0,
    motionOffset = 0,
    longPressTimer = null,
    sheetRevision = 0,
    sheetOpener = null;
  const image = (key, path) => {
    const im = document.createElement("img");
    im.onload = () => {
      assets[key] = im;
      prepareAssets();
      drawNow();
    };
    im.src = path;
  };
  image("friendIsland", "/pebble/square-garden-cutout.png");
  image("terrainSource", "/pebble/square-garden-ground.png");
  image("atlasSource", "/pebble/garden-sprites-v1.png");
  const frames = {
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
  const lawn = [
    [52, -205],
    [624, 167],
    [148, 500],
    [-630, 101],
  ];
  // Separate trees and Pebbles sit over a clean ground plate; roots and terrain never move.
  const sourceToWorld = (x, y) => ({
    x: (x / 635) * 1280 - 640,
    y: (y / 445) * 900 - 350,
  });
  const starter = [
    ["tree", 121, 202, 200],
    ["cottage", 233, 171, 158],
    ["tree", 352, 117, 225],
    ["tree", 534, 218, 190],
    ["tree", 213, 334, 165],
    ["meadow", 161, 262, 91],
    ["bench", 409, 272, 81],
    ["pebble", 309, 269, 98],
    ["pebble", 274, 305, 61],
    ["pebble", 393, 301, 73],
  ].map(([id, x, y, size]) => {
    const p = sourceToWorld(x, y);
    return [id, p.x, p.y, size];
  });
  const riverBank = [
    [439, 126],
    [480, 149],
    [455, 170],
    [486, 188],
    [476, 211],
    [556, 266],
    [528, 291],
    [461, 251],
    [437, 215],
    [401, 193],
    [424, 167],
    [392, 155],
  ].map(([x, y]) => {
    const p = sourceToWorld(x, y);
    return [p.x, p.y];
  });
  const icons = {
    build:
      '<path d="m15 12-8.373 8.373a1 1 0 0 1-3-3L12 9m6 6 4-4M21.5 11.5 19.914 9.914a2 2 0 0 1-.578-1.241L19 5l-4-4-1.293 1.293a1 1 0 0 1-1.414 0L12 2l-2 2 .293.293a1 1 0 0 1 0 1.414L7 9l3 3 2.293-2.293a1 1 0 0 1 1.414 0L16 12"/>',
    activity: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    undo: '<path d="M4 9h10a6 6 0 0 1 0 12M4 9l4-4M4 9l4 4"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  };
  const icon = (key) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key] || icons.build}</svg>`;
  function prepareAssets() {
    if (assets.terrainSource && !assets.terrain) {
      const c = document.createElement("canvas");
      c.width = 635;
      c.height = 445;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(assets.terrainSource, 0, 0, 635, 445);
      assets.terrain = c;
      prepareRiverFrames();
    }
    if (assets.atlasSource && !assets.props) {
      assets.props = {};
      const scale = assets.atlasSource.naturalWidth / 1280;
      for (const [id, f] of Object.entries(frames)) {
        const c = document.createElement("canvas");
        c.width = 48;
        c.height = 48;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const ratio = Math.min(44 / f[2], 44 / f[3]),
          w = Math.round(f[2] * ratio),
          h = Math.round(f[3] * ratio);
        ctx.drawImage(
          assets.atlasSource,
          f[0] * scale,
          f[1] * scale,
          f[2] * scale,
          f[3] * scale,
          Math.floor((48 - w) / 2),
          48 - h,
          w,
          h,
        );
        assets.props[id] = c;
      }
    }
  }
  function html(s) {
    state = s;
    return `<section class="sky-garden" id="sky-garden"><canvas id="sky-canvas" tabindex="0" aria-label="Floating Pebble garden. Drag to explore, pinch or use the plus and minus keys to zoom. Arrow keys pan. Long-press a purchased item to edit, or press Enter to select one."></canvas>${friendIslands(s)}<div class="sky-heading"><div><h1 class="sky-brand" aria-label="Pebble garden"><img src="/pebble/pebble-wordmark.svg?v=2" alt="" width="216" height="96"></h1></div><button class="sky-balance" onclick="SkyGarden.openSheet('build')" aria-label="Build with ${s.balance} Pebbles">${gardenSprite("currency")}<b>${s.balance}</b></button></div><div class="sky-bottom"><button class="sky-activity-button" onclick="SkyGarden.openSheet('activity')">${icon("activity")}<span><b>This week</b><small>Local garden</small></span></button></div><div class="sky-inventory-dock"><button id="sky-inventory-trigger" class="sky-inventory-trigger" type="button" aria-label="Open garden inventory" aria-expanded="false" aria-controls="sky-inventory-panel" onclick="SkyGarden.openSheet('build')"><span class="sky-inventory-handle" aria-hidden="true"></span>${icon("build")}</button></div><div id="sky-selection"></div><div id="sky-sheet-host"></div></section>`;
  }
  // These islands represent connections, never another person's private Garden progress.
  function islandFriends(s) {
    return (s.connections || []).filter(
      (n) =>
        !(s.blocked || []).includes(n) &&
        !(s.removedConnections || []).includes(n),
    );
  }
  function friendIslands(s) {
    const friends = islandFriends(s);
    return `<div class="sky-friend-islands" aria-label="Friend islands">${Array.from({ length: 3 }, (_, i) => `<button class="sky-friend-island" data-island="${i}" type="button" onclick="SkyGarden.friendIsland(${i})" aria-label="${friends[i] ? esc(friends[i]) + "’s friend island" : "An island for a future friend"}"></button>`).join("")}</div>`;
  }
  function backgroundIslands(w, h, t, cam) {
    const scale = Math.pow(
      cam.zoom /
        Math.max(
          0.16,
          Math.min((w - 36) / 1320, Math.max(180, h - 240) / 820, 0.85),
        ),
      0.22,
    );
    return [
      [0.17, 0.22, 90],
      [0.81, 0.29, 76],
      [0.54, 0.15, 62],
    ].map(([x, y, size], i) => ({
      x: x * w - cam.x * 0.13,
      y: y * h - cam.y * 0.08 + Math.sin(t * 0.55 + i * 2) * 3,
      width: size * scale,
      height: size * scale * 0.79,
    }));
  }
  function drawFriendIslands(ctx, w, h, t, cam, ratio) {
    if (!assets.friendIsland) return;
    const boxes = backgroundIslands(w / ratio, h / ratio, t, cam);
    ctx.save();
    ctx.globalAlpha = 0.65;
    boxes.forEach((b) => {
      ctx.drawImage(
        assets.friendIsland,
        Math.round((b.x - b.width / 2) * ratio),
        Math.round((b.y - b.height / 2) * ratio),
        Math.round(b.width * ratio),
        Math.round(b.height * ratio),
      );
    });
    ctx.restore();
  }
  function syncFriendTargets(t) {
    if (!stage) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) t = 0;
    const boxes = backgroundIslands(
      stage.clientWidth,
      stage.clientHeight,
      t,
      camera,
    );
    stage.querySelectorAll(".sky-friend-island").forEach((el, i) => {
      const b = boxes[i];
      el.style.left = b.x - Math.max(44, b.width) / 2 + "px";
      el.style.top = b.y - Math.max(44, b.height) / 2 + "px";
      el.style.width = Math.max(44, b.width) + "px";
      el.style.height = Math.max(44, b.height) + "px";
    });
  }
  function friendIsland(i) {
    const name = islandFriends(state)[i];
    if (name) {
      show(
        `${esc(name)}’s island`,
        `<img class="sky-friend-preview" src="/pebble/square-garden-cutout.png" alt="Pixel garden illustration"><p class="muted mini">Illustrative friend island · private Garden activity isn’t shared.</p>${btn("Message", "gardenNavigate('Messages')")}`,
      );
    } else {
      show(
        "Room for a new friend",
        `<p>A little island is waiting. Meet someone new and grow your worlds together.</p>${btn("Discover people", "gardenNavigate('Discover')")}${btn("Maybe later", "gardenDialog.close()", "light")}`,
      );
    }
  }
  function mount(s) {
    state = s;
    bindGarden(s);
    stage = document.querySelector("#sky-garden");
    if (!stage) return;
    const next = document.querySelector("#sky-canvas");
    if (canvas === next) return;
    clearLongPress();
    pointers.clear();
    gesture = null;
    sheet = "";
    sheetRevision++;
    sheetOpener = null;
    canvas = next;
    context = canvas.getContext("2d");
    if (!context) return;
    if (!initialized) {
      camera.zoom = fitZoom();
      camera.y = 100;
      initialized = true;
    }
    state.decor.forEach((d, i) => {
      if (!Number.isFinite(d.wx)) {
        d.wx = (i % 4) * 70 - 100;
        d.wy = 80 + Math.floor(i / 4) * 45;
      }
    });
    resize();
    bindInventoryTrigger();
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerEnd);
    canvas.addEventListener("pointercancel", pointerCancel);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", keyDown);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
    }
    selectionUI();
    cameraUI();
    syncDrawer();
    if (!frame && window.requestAnimationFrame)
      frame = window.requestAnimationFrame(tick);
  }
  function resize() {
    if (!canvas || !stage) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(stage.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(stage.clientHeight * ratio));
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    if (view === "overview") {
      camera.zoom = fitZoom();
      camera.x = 0;
      camera.y = 100;
    } else constrainCamera();
    drawNow();
  }
  function tick(ms) {
    frame = 0;
    if (!document.querySelector("#sky-canvas")) return;
    if (ms - previousTime > 65) {
      previousTime = ms;
      time = ms / 1000;
      drawNow();
    }
    frame = window.requestAnimationFrame(tick);
  }
  function drawNow() {
    if (context && stage) {
      renderScene(
        context,
        canvas.width,
        canvas.height,
        state?.gardenMotionPaused ? pausedAt : time - motionOffset,
        camera,
        state,
        Math.min(window.devicePixelRatio || 1, 2),
      );
      syncFriendTargets(
        state?.gardenMotionPaused ? pausedAt : time - motionOffset,
      );
    }
  }
  function renderScene(ctx, w, h, t, cam = camera, s = state, ratio = 1) {
    if (!s) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduced) t = 0;
    else if (s.gardenMotionPaused) t = pausedAt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#e8efed";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    drawFriendIslands(ctx, w, h, t, cam, ratio);
    const clouds = [
      [-0.15, 0.16, 1.5],
      [0.58, 0.12, 1.1],
      [0.18, 0.31, 0.75],
      [0.88, 0.43, 1.3],
      [-0.2, 0.65, 1.4],
      [0.5, 0.8, 1.05],
      [0.04, 0.94, 0.7],
    ];
    for (let i = 0; i < clouds.length; i++) {
      const [x, y, size] = clouds[i],
        cw = w / ratio,
        margin = 180 * size,
        travel = cw + margin * 2,
        speed = 1.4 + i * 0.22,
        px =
          ((((x * cw + t * speed - cam.x * 0.055 + margin) % travel) + travel) %
            travel) -
          margin;
      drawCloud(ctx, px * ratio, y * h - cam.y * 0.04 * ratio, size * ratio);
    }
    ctx.save();
    ctx.translate(w / 2, h * 0.47);
    ctx.scale(cam.zoom * ratio, cam.zoom * ratio);
    ctx.translate(-cam.x, -cam.y);
    if (assets.terrain) {
      drawSquareArtwork(ctx);
    } else {
      ctx.fillStyle = "#b2c774";
      ctx.beginPath();
      lawn.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
    drawRiver(ctx, t);
    drawLivingGrass(ctx, t);
    drawSmoke(ctx, t, -102, -265);
    const objects = starter
      .filter(([id]) => id === "tree" || id === "pebble")
      .map(([id, x, y, size], i) => ({ id, x, y, size, key: i }));
    (s.decor || []).forEach((d, i) =>
      objects.push({
        id: d.icon,
        x: d.wx || 0,
        y: d.wy || 0,
        size: propSize(d.icon),
        index: i,
        key: 100 + i,
      }),
    );
    objects.sort((a, b) => a.y - b.y);
    for (const obj of objects) {
      const drawn = {
        ...obj,
        size: obj.index === undefined ? obj.size : displaySize(obj, cam.zoom),
      };
      drawProp(ctx, drawn, t);
      if (obj.index === selected) {
        ctx.strokeStyle = "#fffdf1";
        ctx.lineWidth = 2 / cam.zoom;
        ctx.setLineDash([6 / cam.zoom, 4 / cam.zoom]);
        ctx.beginPath();
        ctx.ellipse(obj.x, obj.y + 5, drawn.size * 0.4, 11, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }
  function displaySize(o, z) {
    if (["pebble", "garnet", "sapphire", "emerald", "citrine"].includes(o.id))
      return Math.min(o.size * 2.6, Math.max(o.size * 1.25, 28 / z));
    if (o.id === "bench")
      return Math.min(o.size * 1.5, Math.max(o.size, 32 / z));
    return o.size;
  }
  function fitZoom() {
    const w = stage?.clientWidth || 430,
      h = stage?.clientHeight || 780;
    return Math.max(
      0.16,
      Math.min((w - 36) / 1320, Math.max(180, h - 240) / 820, 0.85),
    );
  }
  function constrainCamera() {
    camera.x = Math.max(-560, Math.min(560, camera.x));
    camera.y = Math.max(-240, Math.min(420, camera.y));
  }
  function cameraUI() {
    document
      .querySelector("#sky-overview")
      ?.setAttribute("aria-pressed", view === "overview");
    document
      .querySelector("#sky-explore")
      ?.setAttribute("aria-pressed", view === "explore");
  }
  function explore(point) {
    view = "explore";
    camera.zoom = Math.max(
      fitZoom() * 1.8,
      Math.min(0.95, ((stage?.clientWidth || 430) - 80) / 400),
    );
    camera.x = point?.x ?? 0;
    camera.y = point?.y ?? 60;
    constrainCamera();
    cameraUI();
    drawNow();
  }
  function focusObject(p) {
    const objects = [
      ...starter.map(([id, x, y, size]) => ({ id, x, y, size, base: true })),
      ...state.decor.map((d) => ({
        id: d.icon,
        x: d.wx,
        y: d.wy,
        size: propSize(d.icon),
      })),
    ];
    const targets = objects
      .map((o) => ({
        ...o,
        drawSize: o.base ? o.size : displaySize(o, camera.zoom),
      }))
      .filter(
        (o) =>
          Math.abs(p.x - o.x) < Math.max(o.drawSize * 0.5, 24 / camera.zoom) &&
          p.y < o.y + 12 / camera.zoom &&
          p.y > o.y - o.drawSize,
      );
    targets.sort(
      (a, b) =>
        Math.hypot(p.x - a.x, p.y - a.y + a.drawSize * 0.4) -
        Math.hypot(p.x - b.x, p.y - b.y + b.drawSize * 0.4),
    );
    const o = targets[0];
    if (!o) return false;
    explore({ x: o.x, y: o.y - o.drawSize * 0.3 });
    return true;
  }
  function drawCloud(ctx, x, y, s) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(s, s);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#fffdf7";
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(12, 18);
    ctx.lineTo(12, 8);
    ctx.lineTo(27, 8);
    ctx.lineTo(27, 0);
    ctx.lineTo(47, 0);
    ctx.lineTo(47, -10);
    ctx.lineTo(72, -10);
    ctx.lineTo(72, 0);
    ctx.lineTo(91, 0);
    ctx.lineTo(91, 9);
    ctx.lineTo(112, 9);
    ctx.lineTo(112, 18);
    ctx.lineTo(132, 18);
    ctx.lineTo(132, 34);
    ctx.lineTo(0, 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#dce6dd";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(12, 29, 108, 5);
    ctx.fillRect(0, 25, 12, 9);
    ctx.fillRect(120, 25, 12, 9);
    ctx.restore();
  }
  function drawSquareArtwork(ctx) {
    ctx.drawImage(assets.terrain, -640, -350, 1280, 900);
  }
  function propSize(id) {
    return (
      {
        tree: 128,
        cottage: 156,
        hall: 175,
        cafe: 112,
        stage: 120,
        river: 113,
        walkway: 112,
        meadow: 88,
        grass: 37,
        shrub: 69,
        pebble: 49,
        bench: 85,
        lanterns: 68,
        picnic: 91,
        bridge: 97,
        vegetables: 81,
        rock: 60,
      }[id] || 55
    );
  }
  function drawProp(ctx, o, t) {
    const sprite = assets.props?.[o.id];
    if (!sprite) return;
    const { x, y, size, id } = o,
      phase = t + o.key * 0.8,
      wind =
        Math.sin(t * 0.65 + x * 0.004) * 0.72 +
        Math.sin(t * 1.2 + x * 0.008) * 0.28;
    ctx.save();
    ctx.translate(x, y);
    if (id === "tree") {
      // Original trunk and roots stay planted. Only the transparent crown leans.
      ctx.drawImage(
        sprite,
        0,
        32,
        48,
        16,
        -size / 2,
        -size / 3,
        size,
        size / 3,
      );
      ctx.save();
      ctx.translate(0, -size * 0.29);
      ctx.rotate(wind * 0.035);
      ctx.drawImage(
        sprite,
        0,
        0,
        48,
        35,
        -size / 2,
        -size * 0.72,
        size,
        (size * 35) / 48,
      );
      ctx.restore();
    } else if (
      ["grass", "shrub", "meadow", "wildflowers", "vegetables"].includes(id)
    ) {
      ctx.rotate(wind * 0.025);
      ctx.drawImage(sprite, -size / 2, -size, size, size);
    } else {
      const breathing = [
          "pebble",
          "garnet",
          "sapphire",
          "emerald",
          "citrine",
        ].includes(id),
        lift = breathing
          ? (1 - Math.cos((phase * Math.PI * 2) / 7.5)) * 1.4
          : 0;
      if (breathing) {
        ctx.fillStyle = "#3d422a24";
        ctx.fillRect(-size * 0.24, -1, size * 0.48, 4);
        ctx.fillRect(-size * 0.18, 3, size * 0.36, 2);
      }
      // Whole sprite keeps its shape: a very small seven-second breathing lift.
      ctx.drawImage(sprite, -size / 2, -size - lift, size, size);
      if (id === "cottage") drawSmoke(ctx, t, size * 0.31, -size * 0.85);
    }
    ctx.restore();
  }
  function prepareRiverFrames() {
    if (!assets.terrain || assets.riverFrames) return;
    const rect = { x: 384, y: 116, w: 184, h: 188 },
      ctx = assets.terrain.getContext("2d"),
      base = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    assets.riverRect = rect;
    assets.riverFrames = [];
    for (let frame = 0; frame < 24; frame++) {
      const layer = document.createElement("canvas");
      layer.width = rect.w;
      layer.height = rect.h;
      const context = layer.getContext("2d"),
        pixels = context.createImageData(rect.w, rect.h),
        phase = (frame / 24) * Math.PI * 2;
      for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
          const i = (y * rect.w + x) * 4,
            r = base.data[i],
            g = base.data[i + 1],
            b = base.data[i + 2],
            a = base.data[i + 3];
          if (!a || g - r < 14 || b - g < 3 || b - r < 28) continue;
          const px = Math.floor(x / 2) * 2,
            py = Math.floor(y / 2) * 2,
            wave = Math.sin(px * 0.13 + py * 0.23 + phase),
            ribbon = Math.cos(px * 0.1 - py * 0.07 + phase);
          let light = wave * 4;
          if (wave > 0.88 && ribbon > 0.15) light += 10;
          pixels.data[i] = Math.max(0, Math.min(255, r + light));
          pixels.data[i + 1] = Math.max(0, Math.min(255, g + light));
          pixels.data[i + 2] = Math.max(0, Math.min(255, b + light * 0.8));
          pixels.data[i + 3] = a;
        }
      context.putImageData(pixels, 0, 0);
      assets.riverFrames.push(layer);
    }
  }
  function drawRiver(ctx, t) {
    if (!assets.riverFrames?.length) return;
    const r = assets.riverRect,
      p = sourceToWorld(r.x, r.y),
      frame = assets.riverFrames[Math.floor(t * 4) % 24];
    ctx.drawImage(frame, p.x, p.y, (r.w / 635) * 1280, (r.h / 445) * 900);
  }
  const grassRoots = [
    [65, 218],
    [184, 210],
    [337, 203],
    [347, 337],
    [419, 319],
    [580, 247],
    [310, 142],
    [264, 370],
  ];
  function drawLivingGrass(ctx, t) {
    for (let i = 0; i < grassRoots.length; i++) {
      const p = sourceToWorld(...grassRoots[i]),
        bend = Math.sin(t * 0.8 + i * 0.9);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = "#587b38";
      ctx.fillRect(-4, -3, 10, 3);
      for (let blade = 0; blade < 3; blade++) {
        const h = 6 + (blade % 2) * 4,
          x = blade * 3 - 3,
          lean = Math.round(bend * (blade === 1 ? 2 : 3));
        ctx.fillRect(x, -h / 2, 2, h / 2);
        ctx.fillRect(x + lean, -h, 2, h / 2 + 1);
      }
      ctx.fillStyle = "#9db453";
      ctx.fillRect(0, -6 + Math.round(bend), 2, 5);
      ctx.restore();
    }
  }
  function drawSmoke(ctx, t, x, y) {
    for (let i = 0; i < 3; i++) {
      const life = ((t + i * 2.2) % 6.6) / 6.6;
      ctx.globalAlpha = 0.46 * Math.sin(life * Math.PI);
      ctx.fillStyle = "#b2b6a5";
      const n = 7 + Math.floor(life * 11),
        px = Math.round(x + life * 18 - n / 2),
        py = Math.round(y - life * 66);
      ctx.fillRect(px, py, n, n);
      ctx.fillRect(px - 3, py + 3, n + 6, n - 2);
      ctx.fillRect(px + 2, py - 3, n - 4, n + 5);
    }
    ctx.globalAlpha = 1;
  }
  function screenPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function toWorld(p) {
    return {
      x: (p.x - stage.clientWidth / 2) / camera.zoom + camera.x,
      y: (p.y - stage.clientHeight * 0.47) / camera.zoom + camera.y,
    };
  }
  function inPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i],
        [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }
  function onLawn(x, y) {
    return inPolygon(x, y, lawn) && !inPolygon(x, y, riverBank);
  }
  function hit(p, allowIdle = false) {
    if (!arranging && !allowIdle) return -1;
    for (let i = state.decor.length - 1; i >= 0; i--) {
      const d = state.decor[i],
        size = displaySize({ id: d.icon, size: propSize(d.icon) }, camera.zoom);
      if (
        Math.abs(p.x - d.wx) < Math.max(size * 0.45, 25 / camera.zoom) &&
        p.y < d.wy + 16 &&
        p.y > d.wy - size
      )
        return i;
    }
    return -1;
  }
  function clearLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
  function pointerDown(e) {
    if (e.button && e.button !== 0) return;
    clearLongPress();
    canvas.setPointerCapture(e.pointerId);
    const p = screenPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()],
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture = {
        type: "pinch",
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: camera.zoom,
        anchor: toWorld(mid),
      };
      return;
    }
    const world = toWorld(p),
      item = hit(world, true),
      editing = arranging && item >= 0;
    gesture = {
      type: editing ? "item" : "pan",
      item,
      start: p,
      last: p,
      x: camera.x,
      y: camera.y,
      moved: false,
      saved: false,
      offset:
        item >= 0
          ? {
              x: world.x - state.decor[item].wx,
              y: world.y - state.decor[item].wy,
            }
          : { x: 0, y: 0 },
    };
    if (editing) {
      selected = item;
      selectionUI();
    } else if (item >= 0) {
      const held = gesture;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (
          gesture !== held ||
          held.moved ||
          pointers.size !== 1 ||
          state.page !== "Garden"
        )
          return;
        arranging = true;
        placing = false;
        selected = item;
        held.type = "item";
        held.held = true;
        selectionUI();
        canvas.focus({ preventScroll: true });
        drawNow();
      }, 450);
    }
  }
  function pointerMove(e) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const p = screenPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2 && gesture.type === "pinch") {
      clearLongPress();
      const [a, b] = [...pointers.values()],
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      camera.zoom = clamp(
        (gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
          Math.max(1, gesture.distance),
        fitZoom(),
        1.8,
      );
      view = "explore";
      cameraUI();
      camera.x =
        gesture.anchor.x - (mid.x - stage.clientWidth / 2) / camera.zoom;
      camera.y =
        gesture.anchor.y - (mid.y - stage.clientHeight * 0.47) / camera.zoom;
      constrainCamera();
      drawNow();
      return;
    }
    if (gesture.type === "pinch") return;
    const dx = p.x - gesture.start.x,
      dy = p.y - gesture.start.y;
    if (Math.hypot(dx, dy) > 7) {
      gesture.moved = true;
      clearLongPress();
    }
    if (!gesture.moved) return;
    if (view !== "explore") {
      view = "explore";
      cameraUI();
    }
    if (gesture.type === "item") {
      if (!gesture.saved) {
        snapshot();
        gesture.saved = true;
        selectionUI();
      }
      const world = toWorld(p),
        x = world.x - gesture.offset.x,
        y = world.y - gesture.offset.y;
      if (onLawn(x, y)) {
        state.decor[gesture.item].wx = x;
        state.decor[gesture.item].wy = y;
      }
    } else {
      camera.x = clamp(gesture.x - dx / camera.zoom, -2400, 2400);
      camera.y = clamp(gesture.y - dy / camera.zoom, -1400, 1600);
      constrainCamera();
    }
    drawNow();
  }
  function pointerEnd(e) {
    clearLongPress();
    const g = gesture;
    if (
      g &&
      pointers.size === 1 &&
      !g.moved &&
      g.type === "pan" &&
      placing &&
      selected >= 0
    ) {
      const p = toWorld(screenPoint(e));
      if (onLawn(p.x, p.y)) {
        snapshot();
        state.decor[selected].wx = p.x;
        state.decor[selected].wy = p.y;
        placing = false;
        selectionUI();
        toast("Placed " + state.decor[selected].name);
      } else toast("Choose a spot on your island");
    }
    if (g && pointers.size === 1 && !g.moved && g.type === "pan" && !arranging)
      focusObject(toWorld(screenPoint(e)));
    pointers.delete(e.pointerId);
    gesture = pointers.size ? { type: "pinch" } : null;
    drawNow();
  }
  function pointerCancel(e) {
    clearLongPress();
    pointers.delete(e.pointerId);
    gesture = pointers.size ? { type: "pinch" } : null;
    drawNow();
  }
  function bindInventoryTrigger() {
    const trigger = document.querySelector("#sky-inventory-trigger");
    if (!trigger) return;
    let start = null,
      skipClick = false;
    trigger.addEventListener("pointerdown", (e) => {
      if (e.button && e.button !== 0) return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY };
      trigger.setPointerCapture?.(e.pointerId);
    });
    trigger.addEventListener("pointerup", (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dy = e.clientY - start.y,
        dx = e.clientX - start.x;
      start = null;
      if (dy < -32 && Math.abs(dy) > Math.abs(dx)) {
        e.preventDefault();
        skipClick = true;
        openSheet("build");
        setTimeout(() => (skipClick = false), 500);
      }
    });
    trigger.addEventListener("pointercancel", () => (start = null));
    trigger.addEventListener(
      "click",
      (e) => {
        if (skipClick) {
          e.preventDefault();
          e.stopImmediatePropagation();
          skipClick = false;
        }
      },
      true,
    );
  }
  function syncDrawer() {
    const open = sheet === "build",
      trigger = document.querySelector("#sky-inventory-trigger");
    trigger?.setAttribute("aria-expanded", String(open));
    stage?.classList.toggle("inventory-open", open);
  }
  function bindSheetDrag(host) {
    const panel = host.querySelector(".sky-inventory-sheet");
    if (!panel) return;
    const grip = panel.querySelector("header"),
      handle = panel.querySelector(".sky-sheet-handle");
    for (const target of [grip, handle]) {
      if (!target) continue;
      let drag = null;
      target.addEventListener("pointerdown", (e) => {
        if ((e.button && e.button !== 0) || e.target.closest?.("button"))
          return;
        drag = {
          id: e.pointerId,
          y: e.clientY,
          x: e.clientX,
          at: Date.now(),
          distance: 0,
        };
        target.setPointerCapture?.(e.pointerId);
      });
      target.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dy = e.clientY - drag.y;
        if (Math.abs(e.clientX - drag.x) > Math.abs(dy) + 12) return;
        drag.distance = Math.max(0, dy);
        panel.style.transition = "none";
        panel.style.transform = `translateY(${drag.distance}px)`;
        e.preventDefault();
      });
      const finish = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const { distance, at } = drag;
        drag = null;
        panel.style.transition = "";
        if (
          e.type !== "pointercancel" &&
          (distance > 80 || (distance > 32 && Date.now() - at < 250))
        ) {
          closeSheet();
        } else panel.style.transform = "";
      };
      target.addEventListener("pointerup", finish);
      target.addEventListener("pointercancel", finish);
    }
  }
  function wheel(e) {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, screenPoint(e));
  }
  function zoom(factor, point) {
    if (!stage) return;
    const p = point || {
        x: stage.clientWidth / 2,
        y: stage.clientHeight * 0.47,
      },
      anchor = toWorld(p);
    camera.zoom = clamp(camera.zoom * factor, fitZoom(), 1.8);
    camera.x = anchor.x - (p.x - stage.clientWidth / 2) / camera.zoom;
    camera.y = anchor.y - (p.y - stage.clientHeight * 0.47) / camera.zoom;
    if (camera.zoom <= fitZoom() * 1.02) {
      center();
      return;
    }
    view = "explore";
    constrainCamera();
    cameraUI();
    drawNow();
  }
  function center() {
    view = "overview";
    camera.x = 0;
    camera.y = 100;
    camera.zoom = fitZoom();
    cameraUI();
    drawNow();
  }
  function keyDown(e) {
    if (e.key === "Enter" && state.decor.length) {
      e.preventDefault();
      arranging = true;
      placing = false;
      selected = (selected + 1) % state.decor.length;
      selectionUI();
      drawNow();
      return;
    }
    if (["+", "=", "-"].includes(e.key)) {
      e.preventDefault();
      zoom(e.key === "-" ? 0.8 : 1.25);
      return;
    }
    if (e.key === "Escape") {
      done();
      return;
    }
    if (!e.key.startsWith("Arrow")) return;
    e.preventDefault();
    const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0,
      dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (arranging && selected >= 0) {
      const d = state.decor[selected],
        x = d.wx + dx * 8,
        y = d.wy + dy * 8;
      if (onLawn(x, y)) {
        snapshot();
        d.wx = x;
        d.wy = y;
      }
    } else {
      camera.x += (dx * 55) / camera.zoom;
      camera.y += (dy * 55) / camera.zoom;
      view = "explore";
      constrainCamera();
      cameraUI();
    }
    drawNow();
  }
  function snapshot() {
    undo.push({
      balance: state.balance,
      decor: state.decor.map((d) => ({ ...d })),
    });
    if (undo.length > 25) undo.shift();
  }
  function undoLast() {
    const before = undo.pop();
    if (!before) return;
    state.balance = before.balance;
    state.decor = before.decor;
    selected = -1;
    placing = false;
    selectionUI();
    refreshBalance();
    drawNow();
  }
  function purchase(index) {
    const item = gardenShop[index];
    if (!item || state.balance < item[2]) return;
    snapshot();
    state.balance -= item[2];
    state.decor.push({
      icon: item[0],
      name: item[1],
      cost: item[2],
      wx: 0,
      wy: 110,
      x: 50,
      y: 50,
    });
    selected = state.decor.length - 1;
    arranging = true;
    placing = true;
    closeSheet();
    explore({ x: 0, y: 70 });
    refreshBalance();
    selectionUI();
    drawNow();
    canvas?.focus({ preventScroll: true });
  }
  function selectionUI() {
    const host = document.querySelector("#sky-selection");
    if (!host) return;
    if (!arranging) {
      host.innerHTML = "";
      return;
    }
    const d = state.decor[selected];
    host.innerHTML = `<div class="sky-placement"><span>${d ? `${placing ? "Tap the lawn to place" : "Drag to move"} · <b>${esc(d.name)}</b>` : "Tap a purchased item to move it"}</span><div><button aria-label="Undo garden edit" onclick="SkyGarden.undo()" ${!undo.length ? "disabled" : ""}>${icon("undo")}</button>${d ? `<button aria-label="Remove and refund ${esc(d.name)}" onclick="SkyGarden.refundSelected()">${icon("trash")}</button>` : ""}<button class="sky-done" onclick="SkyGarden.done()">Done</button></div></div>`;
  }
  function arrange() {
    arranging = true;
    placing = false;
    closeSheet();
    explore();
    selectionUI();
    canvas?.focus({ preventScroll: true });
  }
  function done() {
    arranging = false;
    placing = false;
    selected = -1;
    selectionUI();
    drawNow();
  }
  function refundSelected() {
    const d = state.decor[selected];
    if (!d) return;
    snapshot();
    state.balance += d.cost;
    state.decor.splice(selected, 1);
    selected = -1;
    placing = false;
    refreshBalance();
    selectionUI();
    drawNow();
  }
  function resetPurchases() {
    if (!state.decor.length) {
      toast("No purchases to reset");
      return;
    }
    show(
      "Reset garden purchases?",
      `<p>Remove ${state.decor.length} purchased items and refund ${state.decor.reduce((n, d) => n + d.cost, 0)} Pebbles? Your starter island stays.</p>${btn("Reset & refund", "SkyGarden.confirmReset()")}${btn("Cancel", "gardenDialog.close()", "light")}`,
    );
  }
  function confirmReset() {
    snapshot();
    state.balance += state.decor.reduce((n, d) => n + d.cost, 0);
    state.decor = [];
    selected = -1;
    placing = false;
    modal.close();
    refreshBalance();
    selectionUI();
    if (sheet) openSheet(sheet);
    drawNow();
  }
  function refreshBalance() {
    const el = document.querySelector(".sky-balance b");
    if (el) el.textContent = state.balance;
  }
  function toggleMotion() {
    if (state.gardenMotionPaused) {
      motionOffset = time - pausedAt;
      state.gardenMotionPaused = false;
    } else {
      pausedAt = time - motionOffset;
      state.gardenMotionPaused = true;
    }
    const el = document.querySelector("#sky-motion");
    if (el) {
      el.innerHTML = icon(state.gardenMotionPaused ? "play" : "pause");
      el.setAttribute(
        "aria-label",
        (state.gardenMotionPaused ? "Play" : "Pause") + " motion",
      );
    }
    drawNow();
  }
  function openSheet(kind) {
    const host = document.querySelector("#sky-sheet-host");
    if (!host) return;
    if (!sheet) sheetOpener = document.activeElement;
    sheetRevision++;
    sheet = kind;
    host.classList.remove("is-closing");
    host.innerHTML = `<div class="sky-sheet-scrim" onclick="SkyGarden.closeSheet()"></div><section class="sky-sheet ${kind === "build" ? "sky-inventory-sheet" : ""}" ${kind === "build" ? 'id="sky-inventory-panel"' : ""} role="dialog" aria-modal="true" aria-label="${kind === "build" ? "Garden inventory" : "Garden activity"}"><div class="sky-sheet-handle" aria-hidden="true"></div><header><div>${kind === "build" ? "" : `<span class="sky-kicker">GROWING TOGETHER</span>`}<h2>${kind === "build" ? "Your garden" : "This week"}</h2></div><button aria-label="Close panel" onclick="SkyGarden.closeSheet()">${icon("close")}</button></header>${kind === "build" ? buildBody() : activityBody()}</section>`;
    host.onkeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.key === "Tab") {
        const buttons = [...host.querySelectorAll("button:not([disabled])")];
        if (!buttons.length) return;
        const first = buttons[0],
          last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    syncDrawer();
    if (kind === "build") {
      paintGardenSprites(host);
      bindSheetDrag(host);
    }
    host
      .querySelector(".sky-sheet header button")
      ?.focus({ preventScroll: true });
  }
  function buildBody() {
    return `<div class="sky-build-meta"><span>${gardenSprite("currency")}<span><b>${state.balance}</b> Pebbles available</span></span><button onclick="SkyGarden.arrange()">Arrange garden ↗</button></div><div class="sky-build-catalog">${gardenBuildCatalog()}</div><footer><small>Demo garden · progress resets on refresh</small><button onclick="SkyGarden.resetPurchases()">Reset purchases & refund</button></footer>`;
  }
  function activityBody() {
    return `<button class="sky-motion-control" onclick="SkyGarden.toggleMotion();SkyGarden.openSheet('activity')">${state.gardenMotionPaused ? "Resume motion" : "Pause motion"}</button><p>Your garden is a local creative space. Garden progress resets when you leave this session; it does not record meetings or earn account rewards.</p><p>${state.decor.length} decorations placed.</p>`;
  }
  function closeSheet() {
    const host = document.querySelector("#sky-sheet-host"),
      panel = host?.querySelector(".sky-inventory-sheet"),
      revision = ++sheetRevision;
    sheet = "";
    syncDrawer();
    if (host) {
      host.onkeydown = null;
      const clear = () => {
        if (revision === sheetRevision) {
          host.innerHTML = "";
          host.classList.remove("is-closing");
        }
      };
      if (
        panel?.animate &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
      ) {
        host.classList.add("is-closing");
        panel.setAttribute("aria-hidden", "true");
        panel.inert = true;
        const from = window.getComputedStyle(panel).transform;
        panel
          .animate(
            [
              {
                transform: from === "none" ? "translateY(0)" : from,
                opacity: 1,
              },
              { transform: "translateY(100%)", opacity: 0.7 },
            ],
            {
              duration: 170,
              easing: "cubic-bezier(.4,0,1,1)",
              fill: "forwards",
            },
          )
          .finished.catch(() => {})
          .then(clear);
      } else clear();
    }
    const target = sheetOpener?.isConnected
      ? sheetOpener
      : document.querySelector("#sky-inventory-trigger") || canvas;
    target?.focus({ preventScroll: true });
  }
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  return {
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      resizeObserver?.disconnect();
      clearLongPress();
      pointers.clear();
      canvas = null;
      stage = null;
      initialized = false;
      undo.length = 0;
      selected = -1;
      arranging = false;
      placing = false;
      modal.close();
    },
    html,
    mount,
    friendIsland,
    zoom,
    center,
    explore,
    fitZoom,
    toggleMotion,
    openSheet,
    closeSheet,
    purchase,
    arrange,
    done,
    undo: undoLast,
    refundSelected,
    resetPurchases,
    confirmReset,
    day(d) {
      state.day = d;
      openSheet("activity");
    },
    renderScene,
    prepareAssets,
    onLawn,
    toWorld,
    camera,
    setAssets(images) {
      Object.assign(assets, images);
      prepareAssets();
    },
    getState() {
      return {
        selected,
        placing,
        arranging,
        undo: undo.length,
        camera: { ...camera },
        sheet,
        view,
      };
    },
  };
})();

window.SkyGarden = SkyGarden;
