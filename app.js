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
const BIF_PLOT_CFG = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  scrollZoom: true,
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
};

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

// Poster seaborn_density_colors — ColorSchemes.seaborn_dark, skip gold (index 9)
const POSTER_DENSITY_COLORS = [
  "#001c7f",
  "#b1400d",
  "#12711c",
  "#8c0800",
  "#591e71",
  "#592f0d",
  "#a23582",
  "#3c3c3c",
  "#006374",
];

function posterSpeciesColors(S_max, predator) {
  const n = Math.max(1, S_max | 0);
  if (predator) {
    const out = ["#000000"];
    for (let i = 0; i < n - 1; i++) {
      out.push(POSTER_DENSITY_COLORS[i % POSTER_DENSITY_COLORS.length]);
    }
    return out;
  }
  return Array.from({ length: n }, (_, i) => POSTER_DENSITY_COLORS[i % POSTER_DENSITY_COLORS.length]);
}

/** Prey trait colors ordered left→right by x (poster trait_member_colors). */
function traitMemberColors(xs) {
  const S = xs.length;
  const order = xs
    .map((x, i) => ({ x: Number(x), i }))
    .sort((a, b) => a.x - b.x)
    .map((o) => o.i);
  const cols = new Array(S);
  order.forEach((speciesIdx, rank) => {
    cols[speciesIdx] = POSTER_DENSITY_COLORS[rank % POSTER_DENSITY_COLORS.length];
  });
  return cols;
}

function applyPosterColors(data) {
  if (data.model === "cadp") {
    data.branches.forEach((br, i) => {
      if (CADP_POSTER_COLORS[i]) br.color = CADP_POSTER_COLORS[i];
    });
  }
  // Replace export managua yellows with poster Methods density / trait palette
  data.species_colors = posterSpeciesColors(data.S_max, !!data.predator);
}

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

function paletteOf(data) {
  const p = data.palette || {};
  return {
    light: p.band_light || BAND_LIGHT,
    dark: p.band_dark || BAND_DARK,
    niche: p.uninhabitable || AXIS_BG,
    poster: p.poster_blue || POSTER_BLUE,
  };
}

function stabilityHeatmap(band, ylim, colors) {
  // softness: 0 = high structural stability (light blue), 1 = low (dark)
  const light = (colors && colors.light) || BAND_LIGHT;
  const dark = (colors && colors.dark) || BAND_DARK;
  const z = [band.softness, band.softness];
  return {
    type: "heatmap",
    x: band.T,
    y: ylim,
    z,
    colorscale: [
      [0, light],
      [1, dark],
    ],
    zmin: 0,
    zmax: 1,
    showscale: false,
    hoverinfo: "skip",
    hoverongaps: false,
    opacity: 1,
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

function lerpRgb(a, b, t) {
  const p = (rgb) => {
    const m = String(rgb).match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    if (String(rgb).startsWith("#") && rgb.length === 7) {
      return [
        parseInt(rgb.slice(1, 3), 16),
        parseInt(rgb.slice(3, 5), 16),
        parseInt(rgb.slice(5, 7), 16),
      ];
    }
    return [222, 237, 252];
  };
  const A = p(a);
  const B = p(b);
  const u = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * u)},${Math.round(
    A[1] + (B[1] - A[1]) * u
  )},${Math.round(A[2] + (B[2] - A[2]) * u)})`;
}

/**
 * Uninhabitable funnel only (NaN gaps in the habitable region).
 * Drawn above the stability stripes so Plotly does not have to alpha-composite.
 */
function nicheGrayHeatmap(niche, nicheColor) {
  const field = nicheField(niche);
  if (!field || !niche.T || !niche.x) return null;
  const nT = niche.T.length;
  const nX = niche.x.length;
  const EDGE = 0.5;
  const z = new Array(nX);
  for (let ix = 0; ix < nX; ix++) {
    const row = new Array(nT);
    for (let iT = 0; iT < nT; iT++) {
      row[iT] = field[iT][ix] >= EDGE ? 1 : NaN;
    }
    z[ix] = row;
  }
  const gray = nicheColor || AXIS_BG;
  return {
    type: "heatmap",
    x: niche.T,
    y: niche.x,
    z,
    colorscale: [
      [0, gray],
      [1, gray],
    ],
    zmin: 0,
    zmax: 1,
    showscale: false,
    hoverinfo: "skip",
    hoverongaps: false,
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
  // Full-frame light→dark blue stability stripes (always visible habitable field)
  traces.push(stabilityHeatmap(data.stability_band, data.axis.ylim, pal));
  const niche = nicheGrayHeatmap(data.niche, pal.niche);
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
            hovertemplate:
              "T<sub>amp</sub> = %{x:.2f}<br>x = %{y:.2f}<br>" +
              layerLabel(layer) +
              "<extra></extra>",
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
    hovertemplate: "Selected point<br>T<sub>amp</sub> = %{x:.2f}<br>x = %{y:.2f}<extra></extra>",
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

function layerLabel(layer) {
  if (layer === "stable") return "Stable (dyn. + invasion)";
  if (layer === "dyn_unstable") return "Dynamically unstable";
  if (layer === "inv_unstable") return "Invasion unstable";
  return layer;
}

function axisTitle(text, fontSize = 11) {
  return { text, font: { size: fontSize, color: "#142033" }, standoff: 10 };
}

/** Always two digits after the decimal (no scientific notation). */
function fmt2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function sideLayout(title, xTitle, yTitle, yType) {
  return {
    margin: { t: 34, r: 16, b: 52, l: 62 },
    title: {
      text: title,
      font: { size: 12, color: "#142033" },
      y: 0.98,
      yanchor: "top",
    },
    xaxis: {
      title: axisTitle(xTitle),
      tickfont: { size: 10 },
      tickformat: ".2f",
      hoverformat: ".2f",
      exponentformat: "none",
      showexponent: "none",
      automargin: true,
      fixedrange: true,
      gridcolor: "rgba(20,32,51,0.08)",
      zeroline: false,
    },
    yaxis: {
      title: axisTitle(yTitle),
      type: yType || "linear",
      tickfont: { size: 10 },
      tickformat: ".2f",
      hoverformat: ".2f",
      exponentformat: "none",
      showexponent: "none",
      automargin: true,
      fixedrange: true,
      gridcolor: "rgba(20,32,51,0.08)",
      zeroline: false,
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
    this.layersOn = { stable: true, dyn_unstable: false, inv_unstable: false };
    // Stable curves only; guides / density dashes off until requested
    this.annotOn = { guides: false, boundaries: false };
    this.branchIdx = 0;
    this.pointIdx = 0;
    this._bifReady = false;
    this._sidesReady = false;
    this._raf = 0;
    this._pendingIdx = null;
    this._nGuide = 0;
    this._nBound = 0;
    this._hasNiche = false;
  }

  /** Force checkbox UI to match intended defaults (browsers may restore old form state). */
  applyDefaultToggles() {
    this.root.querySelectorAll(".toggles input[data-layer]").forEach((el) => {
      el.checked = el.dataset.layer === "stable";
    });
    this.root.querySelectorAll(".toggles input[data-annot]").forEach((el) => {
      el.checked = false;
    });
    this.readToggles();
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
    this.applyDefaultToggles();
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
      margin: { t: 44, r: 20, b: 58, l: 64 },
      title: {
        text: this.data.title,
        font: { size: 16, color: "#142033", family: "Palatino Linotype, Palatino, Georgia, serif" },
      },
      xaxis: {
        title: axisTitle("Amplitude, T_amp", 13),
        range: ax.xlim,
        tickvals: [0, 5, 10, 15, 20, 24],
        tickformat: ".2f",
        hoverformat: ".2f",
        exponentformat: "none",
        showexponent: "none",
        automargin: true,
        gridcolor: "rgba(0,0,0,0)",
        zeroline: false,
        fixedrange: false,
        tickfont: { size: 11 },
      },
      yaxis: {
        title: axisTitle("Trait, x", 13),
        range: ax.ylim,
        tickvals: [-24, -20, -15, -10, -5, 0, 5, 10, 15, 20, 24],
        tickformat: ".2f",
        hoverformat: ".2f",
        exponentformat: "none",
        showexponent: "none",
        automargin: true,
        gridcolor: "rgba(0,0,0,0)",
        zeroline: false,
        fixedrange: false,
        tickfont: { size: 11 },
      },
      paper_bgcolor: POSTER_BLUE,
      plot_bgcolor: BAND_LIGHT,
      showlegend: false,
      dragmode: "zoom",
      hovermode: "closest",
      uirevision: "bif",
    };
    await Plotly.newPlot(this.bifEl, traces, layout, BIF_PLOT_CFG);
    this._bifReady = true;
  }

  applyVisibility() {
    if (!this._bifReady) return;
    // trace order: stability + optional niche + guides + boundaries + layers + marker
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
    const linLayout = sideLayout("Density", "Time, t", "Density, n", "linear");
    linLayout.yaxis.range = [0, this.data.Rtot];
    const logLayout = sideLayout("Density (log)", "Time, t", "log Density, n", "linear");
    const fitLayout = sideLayout("Fitness landscape", "Trait, x", "Fitness, λ", "linear");
    await Promise.all([
      Plotly.newPlot(
        this.logEl,
        cycleTraces.map((tr) => ({ ...tr })),
        logLayout,
        PLOT_CFG
      ),
      Plotly.newPlot(
        this.linEl,
        cycleTraces.map((tr) => ({ ...tr })),
        linLayout,
        PLOT_CFG
      ),
      Plotly.newPlot(this.fitEl, fitTraces, fitLayout, PLOT_CFG),
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
    const densCols = this.data.species_colors;
    const t = br.t;
    const S = this.data.S_max;

    this.status.textContent = `idx = ${pt.idx}, T_amp = ${fmt2(Tamp)}`;

    const nMark = this.bifEl.data.length - 1;
    Plotly.restyle(this.bifEl, { x: [xs.map(() => Tamp)], y: [xs] }, [nMark]);

    const yLog = new Array(S);
    const yLin = new Array(S);
    const lineColors = new Array(S);
    for (let s = 0; s < S; s++) {
      lineColors[s] = densCols[s] || "#333";
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
        // Natural log densities (model state); ticks read as -1, -2, …
        logRow[i] = ok && v > 0 ? Math.log(v) : null;
      }
      yLog[s] = logRow;
      yLin[s] = linRow;
    }
    const idxs = Array.from({ length: S }, (_, i) => i);
    Plotly.restyle(
      this.logEl,
      { x: idxs.map(() => t), y: yLog, "line.color": lineColors },
      idxs
    );
    Plotly.restyle(
      this.linEl,
      { x: idxs.map(() => t), y: yLin, "line.color": lineColors },
      idxs
    );

    const xFit = pt.x_fit;
    const traitCols = traitMemberColors(xs);
    Plotly.restyle(
      this.fitEl,
      {
        x: [xFit, xs, [xFit[0], xFit[xFit.length - 1]]],
        y: [pt.lambda_fit, xs.map(() => 0), [0, 0]],
      },
      [0, 1, 2]
    );
    Plotly.restyle(this.fitEl, { "marker.color": [traitCols], "marker.size": 9 }, [1]);

    const labels = [];
    if (this.data.predator) {
      labels.push(`<span style="color:#000000"><i class="swatch"></i>predator</span>`);
    }
    for (let i = 0; i < xs.length; i++) {
      const color = traitCols[i] || "#333";
      labels.push(
        `<span style="color:${color}"><i class="swatch"></i>x=${fmt2(xs[i])}</span>`
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
