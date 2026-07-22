/* CAD-CADP static bifurcation explorer — poster / compare-plot styling */

const LAYER_STYLE = {
  stable: { width: 5, opacity: 1 },
  dyn_unstable: { width: 1.25, opacity: 1 },
  // slightly stronger than Makie 0.25 so segments read on the dark stability band
  inv_unstable: { width: 5, opacity: 0.4 },
};

// Exact Makie _bif_stable_panel! colors
const BAND_LIGHT = "rgb(222, 237, 252)"; // RGBf(0.87, 0.93, 0.99)
const BAND_DARK = "rgb(1, 26, 61)"; // RGBf(0.004, 0.10, 0.24)
const AXIS_BG = "rgb(77, 92, 110)"; // RGBf(0.30, 0.36, 0.44) — uninhabitable / axis
const POSTER_BLUE = "#B9D6F2";
const PLOT_CFG = { responsive: true, displayModeBar: false };

// Poster CADP bifurcation_colors remapped onto export order
// [1,2,3,9,5,8,4,7,10,12,11,6] (4 & 6 = unstable-only extras)
const CADP_POSTER_COLORS = [
  "#8c564b",
  "#20884b",
  "#2f6fc9",
  "#0d7377",
  "#850915",
  "#C72240",
  "#4fb3b8",
  "#bc8b12",
  "#c560e4",
  "#9331b8",
  "#ff9f24",
  "#e0a3f0",
];

function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** Split NaN/null-gapped polylines into continuous segments (scattergl drops gaps). */
function polySegments(poly) {
  const segs = [];
  let xs = [];
  let ys = [];
  const flush = () => {
    if (xs.length >= 1) segs.push({ T: xs, x: ys });
    xs = [];
    ys = [];
  };
  for (let i = 0; i < poly.T.length; i++) {
    const t = poly.T[i];
    const x = poly.x[i];
    if (isFiniteNum(t) && isFiniteNum(x)) {
      xs.push(t);
      ys.push(x);
    } else {
      flush();
    }
  }
  flush();
  return segs;
}

async function loadGzipJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const ds = new DecompressionStream("gzip");
  const text = await new Response(res.body.pipeThrough(ds)).text();
  return JSON.parse(text);
}

function applyPosterColors(data) {
  if (data.model !== "cadp") return;
  data.branches.forEach((br, i) => {
    if (CADP_POSTER_COLORS[i]) br.color = CADP_POSTER_COLORS[i];
  });
}

function paletteOf(data) {
  const p = data.palette || {};
  return {
    light: p.band_light || BAND_LIGHT,
    dark: p.band_dark || BAND_DARK,
    niche: p.uninhabitable || AXIS_BG,
    poster: p.poster_blue || POSTER_BLUE,
  };
}

function stabilityHeatmap(band, ylim) {
  // softeness: 0 = high structural stability (light), 1 = low (dark)
  const z = [band.softness, band.softness];
  return {
    type: "heatmap",
    x: band.T,
    y: ylim,
    z,
    colorscale: [
      [0, BAND_LIGHT],
      [1, BAND_DARK],
    ],
    zmin: 0,
    zmax: 1,
    showscale: false,
    hoverinfo: "skip",
    opacity: 0.9,
  };
}

/** Soften a Tamp-major mask so the niche edge isn't blocky. */
function softenMask(rows, passes = 4) {
  let cur = rows.map((r) => Float64Array.from(r, (v) => (Number(v) ? 1 : 0)));
  for (let p = 0; p < passes; p++) {
    const next = cur.map((r) => new Float64Array(r.length));
    for (let i = 0; i < cur.length; i++) {
      for (let j = 0; j < cur[i].length; j++) {
        let s = 0;
        let c = 0;
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii >= 0 && ii < cur.length && jj >= 0 && jj < cur[i].length) {
              s += cur[ii][jj];
              c++;
            }
          }
        }
        next[i][j] = s / c;
      }
    }
    cur = next;
  }
  return cur;
}

function nicheField(niche) {
  if (!niche) return null;
  if (niche.soft) return niche.soft;
  if (niche.uninhab) return softenMask(niche.uninhab, 5);
  return null;
}

/** Uninhabitable funnel — soft edge (not binary blocks). */
function nicheHeatmap(niche, nicheColor) {
  const field = nicheField(niche);
  if (!field || !niche.T || !niche.x) return null;
  const nT = niche.T.length;
  const nX = niche.x.length;
  // Stored Tamp-major rows; Plotly wants z[iy][iT]
  const z = new Array(nX);
  for (let ix = 0; ix < nX; ix++) {
    const row = new Array(nT);
    for (let iT = 0; iT < nT; iT++) {
      row[iT] = field[iT][ix];
    }
    z[ix] = row;
  }
  // Parse niche gray → rgba stops for a smooth fade into uninhabitable
  const solid = nicheColor.startsWith("#")
    ? nicheColor
    : nicheColor.replace(/^rgb\(/, "rgba(").includes("rgba")
      ? nicheColor
      : nicheColor.replace("rgb(", "rgba(").replace(")", ",1)");
  const toRgba = (a) => {
    if (solid.startsWith("#") && solid.length === 7) {
      const r = parseInt(solid.slice(1, 3), 16);
      const g = parseInt(solid.slice(3, 5), 16);
      const b = parseInt(solid.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    if (solid.startsWith("rgb(")) return solid.replace("rgb(", "rgba(").replace(")", `,${a})`);
    if (solid.startsWith("rgba(")) return solid.replace(/,\s*[\d.]+\)$/, `,${a})`);
    return `rgba(77,92,110,${a})`;
  };
  return {
    type: "heatmap",
    x: niche.T,
    y: niche.x,
    z,
    colorscale: [
      [0.0, toRgba(0)],
      [0.25, toRgba(0)],
      [0.45, toRgba(0.35)],
      [0.65, toRgba(0.75)],
      [1.0, toRgba(1)],
    ],
    zmin: 0,
    zmax: 1,
    zsmooth: "best",
    showscale: false,
    hoverinfo: "skip",
    opacity: 1,
  };
}

/** Habitable trait interval at Tamp T (null if none). */
function habitableYAtT(niche, T) {
  const field = nicheField(niche);
  if (!field || !niche.T || !niche.x) return null;
  let iT = 0;
  let best = Infinity;
  for (let i = 0; i < niche.T.length; i++) {
    const d = Math.abs(niche.T[i] - T);
    if (d < best) {
      best = d;
      iT = i;
    }
  }
  const row = field[iT];
  let lo = -1;
  let hi = -1;
  for (let ix = 0; ix < row.length; ix++) {
    if (row[ix] < 0.5) {
      if (lo < 0) lo = ix;
      hi = ix;
    }
  }
  if (lo < 0) return null;
  return [niche.x[lo], niche.x[hi]];
}

function guideTraces(data, show) {
  const traces = [];
  const ylim = data.axis.ylim;
  const xlim = data.axis.xlim;
  for (const y of data.guide_y || []) {
    traces.push({
      type: "scatter",
      mode: "lines",
      x: xlim,
      y: [y, y],
      line: { color: "rgba(0,0,0,0.28)", width: 1 },
      hoverinfo: "skip",
      showlegend: false,
      visible: show,
    });
  }
  for (const x of data.guide_x || []) {
    traces.push({
      type: "scatter",
      mode: "lines",
      x: [x, x],
      y: ylim,
      line: { color: "rgba(0,0,0,0.28)", width: 1 },
      hoverinfo: "skip",
      showlegend: false,
      visible: show,
    });
  }
  return traces;
}

function boundaryTraces(data, show) {
  // Clip dashed density transitions to the habitable funnel (not into uninhabitable).
  return (data.boundaries || []).map((T) => {
    const yr = habitableYAtT(data.niche, T) || data.axis.ylim;
    return {
      type: "scatter",
      mode: "lines",
      x: [T, T],
      y: yr,
      line: { color: "rgba(0,0,0,0.85)", width: 1.5, dash: "dot" },
      hoverinfo: "skip",
      showlegend: false,
      visible: show,
    };
  });
}

function bifTraces(data, layersOn, annotOn) {
  const pal = paletteOf(data);
  const traces = [];
  traces.push(stabilityHeatmap(data.stability_band, data.axis.ylim));

  const niche = nicheHeatmap(data.niche, pal.niche);
  const hasNiche = !!niche;
  if (niche) traces.push(niche);

  const guide = guideTraces(data, annotOn.guides);
  const bounds = boundaryTraces(data, annotOn.boundaries);
  traces.push(...guide, ...bounds);

  const layerVis = [];
  // Draw unstable under stable (Makie order): thin dyn → translucent inv → thick stable
  for (const layer of ["dyn_unstable", "inv_unstable", "stable"]) {
    data.branches.forEach((br) => {
      const style = LAYER_STYLE[layer];
      for (const poly of br.polylines[layer] || []) {
        for (const seg of polySegments(poly)) {
          const isPoint = seg.T.length < 2;
          // Omit line/marker keys entirely — Plotly throws on `line: undefined`
          const tr = {
            type: "scatter",
            mode: isPoint ? "markers" : "lines",
            x: seg.T,
            y: seg.x,
            opacity: isPoint ? 1 : style.opacity,
            connectgaps: false,
            visible: layersOn[layer],
            hoverinfo: "skip",
            showlegend: false,
          };
          if (isPoint) {
            tr.marker = {
              color: br.color,
              size: Math.max(4, style.width),
              opacity: style.opacity,
            };
          } else {
            tr.line = { color: br.color, width: style.width, simplify: false };
          }
          traces.push(tr);
          layerVis.push(layer);
        }
      }
    });
  }

  traces.push({
    type: "scatter",
    mode: "markers",
    x: [],
    y: [],
    marker: { color: "#111", size: 9 },
    hoverinfo: "skip",
    showlegend: false,
  });

  return {
    traces,
    hasNiche,
    nGuide: guide.length,
    nBound: bounds.length,
    layerVis,
  };
}

function sideLayout(title, yTitle, yType) {
  return {
    margin: { t: 28, r: 12, b: 36, l: 48 },
    title: { text: title, font: { size: 12, color: "#142033" } },
    xaxis: {
      title: "t",
      titlefont: { size: 11 },
      tickfont: { size: 10 },
      fixedrange: true,
      gridcolor: "rgba(20,32,51,0.08)",
    },
    yaxis: {
      title: yTitle,
      type: yType || "linear",
      titlefont: { size: 11 },
      tickfont: { size: 10 },
      fixedrange: true,
      gridcolor: "rgba(20,32,51,0.08)",
    },
    showlegend: false,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(255,255,255,0.72)",
    uirevision: title,
  };
}

class ModelPanel {
  constructor(root, data) {
    this.root = root;
    this.data = data;
    this.menu = root.querySelector(".branch-menu");
    this.slider = root.querySelector(".point-slider");
    this.status = root.querySelector(".status");
    this.legend = root.querySelector("[data-legend]");
    this.bifEl = root.querySelector('[data-plot="bif"]');
    this.logEl = root.querySelector('[data-plot="cycle-log"]');
    this.linEl = root.querySelector('[data-plot="cycle-lin"]');
    this.fitEl = root.querySelector('[data-plot="fit"]');
    this.layersOn = { stable: true, dyn_unstable: true, inv_unstable: true };
    // Guides on; density-transition dashes off by default
    this.annotOn = { guides: true, boundaries: false };
    this.branchIdx = 0;
    this.pointIdx = 0;
    this._bifReady = false;
    this._sidesReady = false;
    this._raf = 0;
    this._pendingIdx = null;
    this._hasNiche = false;
    this._nGuide = 0;
    this._nBound = 0;
  }

  readToggles() {
    this.root.querySelectorAll(".toggles input[data-layer]").forEach((el) => {
      this.layersOn[el.dataset.layer] = el.checked;
    });
    this.root.querySelectorAll(".toggles input[data-annot]").forEach((el) => {
      this.annotOn[el.dataset.annot] = el.checked;
    });
  }

  fillMenu() {
    this.menu.innerHTML = "";
    this.data.menu.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = String(m.branch);
      opt.textContent = m.label;
      this.menu.appendChild(opt);
    });
    if (this.data.menu.length) {
      this.branchIdx = this.data.menu[0].branch;
      this.menu.value = String(this.branchIdx);
    }
  }

  currentBranch() {
    return this.data.branches[this.branchIdx];
  }

  currentPoint() {
    return this.currentBranch().points[this.pointIdx];
  }

  async init() {
    this.readToggles();
    this.fillMenu();
    this.bind();
    await Promise.all([this.drawBif(), this.initSidePlots()]);
    this.setBranch(this.branchIdx, true);
  }

  bind() {
    this.root.querySelectorAll(".toggles input").forEach((el) => {
      el.addEventListener("change", () => {
        this.readToggles();
        this.applyVisibility();
      });
    });
    this.menu.addEventListener("change", () => {
      this.setBranch(Number(this.menu.value), true);
    });
    this.slider.addEventListener("input", () => {
      this._pendingIdx = Number(this.slider.value);
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        if (this._pendingIdx == null) return;
        this.pointIdx = this._pendingIdx;
        this._pendingIdx = null;
        this.updatePoint();
      });
    });
  }

  async drawBif() {
    const { traces, hasNiche, nGuide, nBound, layerVis } = bifTraces(
      this.data,
      this.layersOn,
      this.annotOn
    );
    this._hasNiche = hasNiche;
    this._nGuide = nGuide;
    this._nBound = nBound;
    this._layerVis = layerVis;
    const ax = this.data.axis;
    const layout = {
      margin: { t: 40, r: 18, b: 52, l: 58 },
      title: {
        text: this.data.title,
        font: { size: 16, color: "#142033", family: "Palatino Linotype, Palatino, Georgia, serif" },
      },
      xaxis: {
        title: { text: "Amplitude, T_amp", font: { size: 13 } },
        range: ax.xlim,
        tickvals: [0, 5, 10, 15, 20, 24],
        gridcolor: "rgba(0,0,0,0)",
        zeroline: false,
        fixedrange: true,
        tickfont: { size: 11 },
      },
      yaxis: {
        title: { text: "Trait, x", font: { size: 13 } },
        range: ax.ylim,
        tickvals: [-24, -20, -15, -10, -5, 0, 5, 10, 15, 20, 24],
        gridcolor: "rgba(0,0,0,0)",
        zeroline: false,
        fixedrange: true,
        tickfont: { size: 11 },
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: AXIS_BG,
      showlegend: false,
      uirevision: "bif",
    };
    await Plotly.newPlot(this.bifEl, traces, layout, PLOT_CFG);
    this._bifReady = true;
  }

  applyVisibility() {
    if (!this._bifReady) return;
    // trace order: heatmap + optional niche + guides + boundaries + layers + marker
    const vis = [true];
    if (this._hasNiche) vis.push(true);
    for (let i = 0; i < this._nGuide; i++) vis.push(this.annotOn.guides);
    for (let i = 0; i < this._nBound; i++) vis.push(this.annotOn.boundaries);
    for (const layer of this._layerVis || []) vis.push(this.layersOn[layer]);
    vis.push(true);
    const idxs = vis.map((_, i) => i);
    Plotly.restyle(this.bifEl, { visible: vis }, idxs);
  }

  async initSidePlots() {
    const S = this.data.S_max;
    const cols = this.data.species_colors;
    const t0 = this.data.branches[0]?.t || [0, 1];
    const blank = t0.map(() => null);
    const cycleTraces = [];
    for (let s = 0; s < S; s++) {
      cycleTraces.push({
        type: "scattergl",
        mode: "lines",
        x: t0,
        y: blank,
        line: { color: cols[s] || "#333", width: 2 },
        hoverinfo: "skip",
        showlegend: false,
      });
    }
    const fitTraces = [
      {
        type: "scattergl",
        mode: "lines",
        x: [-1, 1],
        y: [0, 0],
        line: { color: "#2f6fc9", width: 2 },
        hoverinfo: "skip",
        showlegend: false,
      },
      {
        type: "scatter",
        mode: "markers",
        x: [],
        y: [],
        marker: { color: "#ff7f0e", size: 8 },
        hoverinfo: "skip",
        showlegend: false,
      },
      {
        type: "scatter",
        mode: "lines",
        x: [-1, 1],
        y: [0, 0],
        line: { color: "#111", width: 1, dash: "dot" },
        hoverinfo: "skip",
        showlegend: false,
      },
    ];
    const linLayout = sideLayout("Density", "n", "linear");
    linLayout.yaxis.range = [0, this.data.Rtot];
    await Promise.all([
      Plotly.newPlot(
        this.logEl,
        cycleTraces.map((tr) => ({ ...tr })),
        sideLayout("Density (log)", "n", "log"),
        PLOT_CFG
      ),
      Plotly.newPlot(
        this.linEl,
        cycleTraces.map((tr) => ({ ...tr })),
        linLayout,
        PLOT_CFG
      ),
      Plotly.newPlot(this.fitEl, fitTraces, sideLayout("Fitness landscape", "λ", "linear"), PLOT_CFG),
    ]);
    this._sidesReady = true;
  }

  setBranch(bi, resetPoint) {
    this.branchIdx = bi;
    const br = this.currentBranch();
    this.slider.min = 0;
    this.slider.max = Math.max(0, br.points.length - 1);
    if (resetPoint) this.pointIdx = 0;
    this.pointIdx = Math.min(this.pointIdx, br.points.length - 1);
    this.slider.value = String(this.pointIdx);
    this.updatePoint();
  }

  updatePoint() {
    if (!this._sidesReady || !this._bifReady) return;
    const br = this.currentBranch();
    const pt = this.currentPoint();
    const Tamp = pt.Tamp;
    const xs = pt.xs.filter((v) => Number.isFinite(v));
    const cols = this.data.species_colors;
    const t = br.t;
    const S = this.data.S_max;

    this.status.textContent = `idx = ${pt.idx}, T_amp = ${Number(Tamp).toPrecision(4)}`;

    const nMark = this.bifEl.data.length - 1;
    Plotly.restyle(this.bifEl, { x: [xs.map(() => Tamp)], y: [xs] }, [nMark]);

    const yLog = new Array(S);
    const yLin = new Array(S);
    for (let s = 0; s < S; s++) {
      const row = pt.n[s];
      if (!row) {
        yLog[s] = t.map(() => null);
        yLin[s] = yLog[s];
        continue;
      }
      const logRow = new Array(row.length);
      const linRow = new Array(row.length);
      for (let i = 0; i < row.length; i++) {
        const v = row[i];
        const ok = Number.isFinite(v);
        linRow[i] = ok ? v : null;
        logRow[i] = ok && v > 0 ? v : null;
      }
      yLog[s] = logRow;
      yLin[s] = linRow;
    }
    const idxs = Array.from({ length: S }, (_, i) => i);
    Plotly.restyle(this.logEl, { x: idxs.map(() => t), y: yLog }, idxs);
    Plotly.restyle(this.linEl, { x: idxs.map(() => t), y: yLin }, idxs);

    const xFit = pt.x_fit;
    Plotly.restyle(
      this.fitEl,
      {
        x: [xFit, xs, [xFit[0], xFit[xFit.length - 1]]],
        y: [pt.lambda_fit, xs.map(() => 0), [0, 0]],
      },
      [0, 1, 2]
    );

    const preyStart = this.data.predator ? 1 : 0;
    const labels = [];
    if (this.data.predator) {
      labels.push(`<span style="color:${cols[0]}"><i class="swatch"></i>predator</span>`);
    }
    for (let i = 0; i < xs.length; i++) {
      const color = cols[preyStart + i] || cols[i] || "#333";
      labels.push(
        `<span style="color:${color}"><i class="swatch"></i>x=${Number(xs[i]).toPrecision(3)}</span>`
      );
    }
    this.legend.innerHTML = labels.join("");
  }
}

async function bootPanel(el) {
  const model = el.dataset.model;
  const status = el.querySelector(".status");
  status.textContent = "loading data…";
  const [data, niche] = await Promise.all([
    loadGzipJson(`data/${model}.json.gz`),
    loadGzipJson(`data/${model}_niche.json.gz`).catch(() => null),
  ]);
  if (niche && !data.niche) data.niche = niche;
  applyPosterColors(data);
  status.textContent = "drawing…";
  const panel = new ModelPanel(el, data);
  await panel.init();
  return panel;
}

async function main() {
  const panels = [...document.querySelectorAll(".model-panel")];
  await Promise.all(
    panels.map(async (el) => {
      try {
        await bootPanel(el);
      } catch (err) {
        console.error(err);
        el.querySelector(".status").textContent = `error: ${err.message}`;
      }
    })
  );
}

main();
