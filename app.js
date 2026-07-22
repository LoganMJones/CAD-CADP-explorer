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

const MOBILE_MQ = window.matchMedia("(max-width: 960px)");

function isMobileLayout() {
  return MOBILE_MQ.matches;
}

/** Hide numeric tick labels on narrow screens (axis titles stay). */
function applyTickVisibility(layout) {
  const show = !isMobileLayout();
  layout.xaxis = layout.xaxis || {};
  layout.yaxis = layout.yaxis || {};
  layout.xaxis.showticklabels = show;
  layout.yaxis.showticklabels = show;
  if (!show) {
    // Recover space once numbers are gone
    const m = layout.margin || {};
    layout.margin = {
      t: m.t ?? 34,
      r: Math.min(m.r ?? 16, 10),
      b: Math.min(m.b ?? 52, 36),
      l: Math.min(m.l ?? 62, 36),
    };
  }
  return layout;
}

function tickRelayoutPatch() {
  const show = !isMobileLayout();
  const patch = {
    "xaxis.showticklabels": show,
    "yaxis.showticklabels": show,
  };
  if (!show) {
    patch["margin.r"] = 10;
    patch["margin.b"] = 36;
    patch["margin.l"] = 36;
  } else {
    patch["margin.r"] = 16;
    patch["margin.b"] = 52;
    patch["margin.l"] = 62;
  }
  return patch;
}

/** Always two digits after the decimal (no scientific notation). */
function fmt2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

/**
 * Compact two-digit labels for densities: 10, 1.0, .38
 * (2 significant figures; drop leading 0 before the decimal when |v| < 1).
 */
function fmtDigits2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const g = Number(a.toPrecision(2));
  if (g >= 10) {
    const r = Math.round(g);
    if (Math.abs(g - r) <= Math.max(1e-9, 1e-6 * Math.abs(r))) return sign + String(r);
    return sign + String(g);
  }
  if (g >= 1) return sign + g.toFixed(1);
  let s = g.toPrecision(2);
  if (s.startsWith("0.")) s = s.slice(1);
  return sign + s;
}

function niceTickVals(min, max, count = 5) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0];
  if (hi === lo) return [lo];
  const span = hi - lo;
  const raw = span / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const norm = raw / mag;
  let step = mag;
  if (norm >= 5) step = 5 * mag;
  else if (norm >= 2) step = 2 * mag;
  else step = mag;
  const start = Math.ceil(lo / step - 1e-12) * step;
  const vals = [];
  for (let x = start; x <= hi + step * 1e-9; x += step) {
    const v = Math.abs(x) < step * 1e-10 ? 0 : Number(x.toPrecision(8));
    vals.push(v);
    if (vals.length > 12) break;
  }
  if (!vals.length || vals[0] > lo + step * 0.05) vals.unshift(lo);
  if (vals[vals.length - 1] < hi - step * 0.05) vals.push(hi);
  return vals;
}

function axisTicksDigits2(min, max, count = 5) {
  const tickvals = niceTickVals(min, max, count);
  return {
    tickmode: "array",
    tickvals,
    ticktext: tickvals.map(fmtDigits2),
    tickformat: null,
    hoverformat: null,
  };
}

function applyDensityAxisFormats(layout, tMax, yMin, yMax) {
  Object.assign(layout.xaxis, axisTicksDigits2(0, tMax, 5));
  Object.assign(layout.yaxis, axisTicksDigits2(yMin, yMax, 5));
  return layout;
}

function sideLayout(title, xTitle, yTitle, yType) {
  return applyTickVisibility({
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
  });
}

class ModelPanel {
  constructor(root, datasets) {
    this.root = root;
    this.datasets = datasets;
    this.data = datasets.cad;
    this.menu = root.querySelector(".branch-menu");
    this.slider = root.querySelector(".point-slider");
    this.status = root.querySelector(".status");
    this.legend = root.querySelector("[data-legend]");
    this.titleEl = root.querySelector(".model-title") || root.querySelector(".model-head h3");
    this.predatorToggle = root.querySelector('input[data-model="predator"]');
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
    this._switching = false;
    this._menuLabel = null;
    this._sideS = null;
  }

  /** Force checkbox UI to match intended defaults (browsers may restore old form state). */
  applyDefaultToggles() {
    this.root.querySelectorAll(".toggles input[data-layer]").forEach((el) => {
      el.checked = el.dataset.layer === "stable";
    });
    this.root.querySelectorAll(".toggles input[data-annot]").forEach((el) => {
      el.checked = false;
    });
    if (this.predatorToggle) this.predatorToggle.checked = false;
    this.readToggles();
    this.syncModelTitle();
  }

  readToggles() {
    this.root.querySelectorAll(".toggles input[data-layer]").forEach((el) => {
      this.layersOn[el.dataset.layer] = el.checked;
    });
    this.root.querySelectorAll(".toggles input[data-annot]").forEach((el) => {
      this.annotOn[el.dataset.annot] = el.checked;
    });
  }

  syncModelTitle() {
    if (!this.titleEl) return;
    this.titleEl.textContent = this.data.predator ? "Predator present" : "Predator absent";
  }

  fillMenu(preferLabel, preferTamp) {
    const want =
      preferLabel ||
      this._menuLabel ||
      this.data.menu.find((m) => m.branch === this.branchIdx)?.label;
    this.menu.innerHTML = "";
    this.data.menu.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = String(m.branch);
      opt.textContent = m.label;
      this.menu.appendChild(opt);
    });
    if (!this.data.menu.length) return;
    const match = want ? this.data.menu.find((m) => m.label === want) : null;
    const pick =
      match ||
      this.nearestStableMenuEntry(preferTamp) ||
      this.data.menu[0];
    this.branchIdx = pick.branch;
    this.menu.value = String(this.branchIdx);
    this._menuLabel = pick.label;
  }

  /** Stable Tamp extent for a branch (from stable polylines), or null if none. */
  stableTampRange(br) {
    const segs = (br && br.polylines && br.polylines.stable) || [];
    let lo = Infinity;
    let hi = -Infinity;
    for (const seg of segs) {
      const Ts = (seg && seg.T) || [];
      for (const t of Ts) {
        if (!Number.isFinite(Number(t))) continue;
        const v = Number(t);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    return { lo, hi, mid: 0.5 * (lo + hi) };
  }

  /**
   * When a branch label is missing on the other model, pick the menu entry
   * whose stable Tamp interval is nearest to preferTamp (0 if Tamp lies inside).
   */
  nearestStableMenuEntry(preferTamp) {
    const Tamp = Number(preferTamp);
    const hasT = Number.isFinite(Tamp);
    let best = null;
    let bestD = Infinity;
    let bestMid = Infinity;
    for (const m of this.data.menu) {
      const br = this.data.branches[m.branch];
      const range = this.stableTampRange(br);
      if (!range) continue;
      let d;
      if (!hasT) {
        d = Math.abs(range.mid);
      } else if (Tamp >= range.lo && Tamp <= range.hi) {
        d = 0;
      } else {
        d = Math.min(Math.abs(Tamp - range.lo), Math.abs(Tamp - range.hi));
      }
      const midDist = hasT ? Math.abs(range.mid - Tamp) : Math.abs(range.mid);
      if (d < bestD - 1e-12 || (Math.abs(d - bestD) <= 1e-12 && midDist < bestMid)) {
        bestD = d;
        bestMid = midDist;
        best = m;
      }
    }
    return best;
  }

  currentBranch() {
    return this.data.branches[this.branchIdx];
  }

  currentPoint() {
    return this.currentBranch().points[this.pointIdx];
  }

  nearestPointIndex(br, Tamp) {
    if (!br || !br.points || !br.points.length) return 0;
    if (!Number.isFinite(Number(Tamp))) return Math.min(this.pointIdx, br.points.length - 1);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < br.points.length; i++) {
      const d = Math.abs(Number(br.points[i].Tamp) - Number(Tamp));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  async init() {
    this.applyDefaultToggles();
    this.fillMenu();
    this.bind();
    await Promise.all([this.drawBif(), this.initSidePlots()]);
    this.setBranch(this.branchIdx, true);
  }

  bind() {
    this.root.querySelectorAll(".toggles input[data-layer], .toggles input[data-annot]").forEach((el) => {
      el.addEventListener("change", () => {
        this.readToggles();
        this.applyVisibility();
      });
    });
    if (this.predatorToggle) {
      this.predatorToggle.addEventListener("change", () => {
        this.switchModel(!!this.predatorToggle.checked);
      });
    }
    this.menu.addEventListener("change", () => {
      const bi = Number(this.menu.value);
      const entry = this.data.menu.find((m) => m.branch === bi);
      if (entry) this._menuLabel = entry.label;
      this.setBranch(bi, true);
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

  async switchModel(predator) {
    if (this._switching) return;
    const next = predator ? this.datasets.cadp : this.datasets.cad;
    if (!next || next === this.data) {
      this.syncModelTitle();
      return;
    }
    this._switching = true;
    this.status.textContent = "switching…";
    try {
      let keepTamp = null;
      try {
        keepTamp = this.currentPoint().Tamp;
      } catch (_) {
        /* ignore */
      }
      const keepLabel = this._menuLabel;
      const bifRanges = this.captureBifRanges();

      this.data = next;
      this.syncModelTitle();
      this.fillMenu(keepLabel, keepTamp);

      // Same S_max → keep side-plot traces; only rebuild bif curves
      const rebuildSides = !this._sidesReady || this._sideS !== this.data.S_max;
      await this.drawBif(bifRanges);
      if (rebuildSides) {
        await this.initSidePlots();
      } else {
        const xt = axisTicksDigits2(0, this.data.tau ?? 10, 5);
        const yt = axisTicksDigits2(0, this.data.Rtot, 5);
        Plotly.relayout(this.linEl, {
          "xaxis.tickmode": xt.tickmode,
          "xaxis.tickvals": xt.tickvals,
          "xaxis.ticktext": xt.ticktext,
          "yaxis.tickmode": yt.tickmode,
          "yaxis.tickvals": yt.tickvals,
          "yaxis.ticktext": yt.ticktext,
          "yaxis.range": [0, this.data.Rtot],
        });
        Plotly.relayout(this.logEl, {
          "xaxis.tickmode": xt.tickmode,
          "xaxis.tickvals": xt.tickvals,
          "xaxis.ticktext": xt.ticktext,
        });
      }
      this.applyVisibility();
      this.setBranchNear(this.branchIdx, keepTamp);
      this.syncTickLabels();
    } catch (err) {
      console.error(err);
      this.status.textContent = `error: ${err.message}`;
    } finally {
      this._switching = false;
    }
  }

  captureBifRanges() {
    if (!this._bifReady || !this.bifEl.layout) return null;
    const x = this.bifEl.layout.xaxis && this.bifEl.layout.xaxis.range;
    const y = this.bifEl.layout.yaxis && this.bifEl.layout.yaxis.range;
    if (!x && !y) return null;
    return { x: x && x.slice(), y: y && y.slice() };
  }

  async drawBif(keepRanges) {
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
        range: (keepRanges && keepRanges.x) || ax.xlim,
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
        range: (keepRanges && keepRanges.y) || ax.ylim,
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
    applyTickVisibility(layout);
    if (isMobileLayout()) {
      layout.margin = { t: 36, r: 10, b: 40, l: 36 };
    }
    if (this._bifReady) {
      await Plotly.react(this.bifEl, traces, layout, BIF_PLOT_CFG);
    } else {
      await Plotly.newPlot(this.bifEl, traces, layout, BIF_PLOT_CFG);
    }
    this._bifReady = true;
  }

  syncTickLabels() {
    if (!this._bifReady) return;
    const show = !isMobileLayout();
    const bifPatch = {
      "xaxis.showticklabels": show,
      "yaxis.showticklabels": show,
      "margin.r": show ? 20 : 10,
      "margin.b": show ? 58 : 40,
      "margin.l": show ? 64 : 36,
      "margin.t": show ? 44 : 36,
    };
    const sidePatch = tickRelayoutPatch();
    Plotly.relayout(this.bifEl, bifPatch);
    if (!this._sidesReady) return;
    Plotly.relayout(this.logEl, sidePatch);
    Plotly.relayout(this.linEl, sidePatch);
    Plotly.relayout(this.fitEl, sidePatch);
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
    const Rtot = this.data.Rtot;
    linLayout.yaxis.range = [0, Rtot];
    applyDensityAxisFormats(linLayout, this.data.tau ?? 10, 0, Rtot);

    const logLayout = sideLayout("Density (log)", "Time, t", "log Density, n", "linear");
    applyDensityAxisFormats(logLayout, this.data.tau ?? 10, -6, 5);

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
    this._sideS = S;
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
    const entry = this.data.menu.find((m) => m.branch === bi);
    if (entry) this._menuLabel = entry.label;
    this.updatePoint();
  }

  /** Keep community label + nearest Tamp when swapping models. */
  setBranchNear(bi, Tamp) {
    if (!this.data.branches[bi]) {
      bi = this.data.menu[0] ? this.data.menu[0].branch : 0;
    }
    this.branchIdx = bi;
    const br = this.currentBranch();
    this.slider.min = 0;
    this.slider.max = Math.max(0, br.points.length - 1);
    this.pointIdx = this.nearestPointIndex(br, Tamp);
    this.menu.value = String(this.branchIdx);
    this.slider.value = String(this.pointIdx);
    const entry = this.data.menu.find((m) => m.branch === this.branchIdx);
    if (entry) this._menuLabel = entry.label;
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

    // Keep log-density tick labels in the compact two-digit style as the range shifts
    let logMin = Infinity;
    let logMax = -Infinity;
    for (const row of yLog) {
      if (!row) continue;
      for (const v of row) {
        if (!Number.isFinite(v)) continue;
        if (v < logMin) logMin = v;
        if (v > logMax) logMax = v;
      }
    }
    if (Number.isFinite(logMin) && Number.isFinite(logMax)) {
      const pad = Math.max(0.15 * (logMax - logMin), 0.25);
      const y0 = logMin - pad;
      const y1 = logMax + pad;
      const ticks = axisTicksDigits2(y0, y1, 5);
      Plotly.relayout(this.logEl, {
        "yaxis.range": [y0, y1],
        "yaxis.tickmode": ticks.tickmode,
        "yaxis.tickvals": ticks.tickvals,
        "yaxis.ticktext": ticks.ticktext,
      });
    }

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

async function loadModelBundle(model) {
  const [data, niche] = await Promise.all([
    loadGzipJson(`data/${model}.json.gz`),
    loadGzipJson(`data/${model}_niche.json.gz`).catch(() => null),
  ]);
  if (niche && !data.niche) data.niche = niche;
  applyPosterColors(data);
  return data;
}

async function bootPanel(el) {
  const status = el.querySelector(".status");
  status.textContent = "loading data…";
  const [cad, cadp] = await Promise.all([loadModelBundle("cad"), loadModelBundle("cadp")]);
  status.textContent = "drawing…";
  const panel = new ModelPanel(el, { cad, cadp });
  await panel.init();
  return panel;
}

async function main() {
  const el = document.querySelector(".model-panel");
  const live = [];
  if (el) {
    try {
      const panel = await bootPanel(el);
      if (panel) live.push(panel);
    } catch (err) {
      console.error(err);
      el.querySelector(".status").textContent = `error: ${err.message}`;
    }
  }

  function syncAllTicks() {
    live.forEach((p) => p.syncTickLabels());
  }
  if (typeof MOBILE_MQ.addEventListener === "function") {
    MOBILE_MQ.addEventListener("change", syncAllTicks);
  } else if (typeof MOBILE_MQ.addListener === "function") {
    MOBILE_MQ.addListener(syncAllTicks);
  }
}

main();
