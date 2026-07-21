/* CAD-CADP static bifurcation explorer — poster styling */

const LAYER_STYLE = {
  stable: { width: 5, opacity: 1 },
  dyn_unstable: { width: 1.25, opacity: 1 },
  // slightly stronger than Makie 0.25 so segments read on the dark stability band
  inv_unstable: { width: 5, opacity: 0.4 },
};

const BAND_LIGHT = "rgb(222, 237, 252)";
const BAND_DARK = "rgb(1, 26, 61)";
const AXIS_BG = "rgb(77, 92, 110)";
const PLOT_CFG = { responsive: true, displayModeBar: false };

function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** Split NaN/null-gapped polylines into continuous segments (scattergl drops gaps). */
function polySegments(poly) {
  const segs = [];
  let xs = [];
  let ys = [];
  const flush = () => {
    // keep length-1 pieces as markers so transition crumbs aren't dropped
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

function stabilityHeatmap(band, ylim) {
  // Plotly: z[i][j] at (x[j], y[i]) — two y rows spanning the axis
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
  const ylim = data.axis.ylim;
  return (data.boundaries || []).map((x) => ({
    type: "scatter",
    mode: "lines",
    x: [x, x],
    y: ylim,
    line: { color: "rgba(0,0,0,0.85)", width: 1.5, dash: "dot" },
    hoverinfo: "skip",
    showlegend: false,
    visible: show,
  }));
}

function bifTraces(data, layersOn, annotOn) {
  const traces = [];
  traces.push(stabilityHeatmap(data.stability_band, data.axis.ylim));

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
          traces.push({
            type: "scatter",
            mode: isPoint ? "markers" : "lines",
            x: seg.T,
            y: seg.x,
            line: isPoint
              ? undefined
              : { color: br.color, width: style.width, simplify: false },
            marker: isPoint
              ? { color: br.color, size: Math.max(4, style.width), opacity: style.opacity }
              : undefined,
            opacity: isPoint ? 1 : style.opacity,
            connectgaps: false,
            visible: layersOn[layer],
            hoverinfo: "skip",
            showlegend: false,
          });
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
    nGuide: guide.length,
    nBound: bounds.length,
    layerVis,
  };
}

function sideLayout(title, yTitle, yType) {
  return {
    margin: { t: 28, r: 12, b: 36, l: 48 },
    title: { text: title, font: { size: 12 } },
    xaxis: { title: "t", titlefont: { size: 11 }, tickfont: { size: 10 }, fixedrange: true },
    yaxis: {
      title: yTitle,
      type: yType || "linear",
      titlefont: { size: 11 },
      tickfont: { size: 10 },
      fixedrange: true,
    },
    showlegend: false,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(251,252,254,1)",
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
    this.annotOn = { guides: false, boundaries: false };
    this.branchIdx = 0;
    this.pointIdx = 0;
    this._bifReady = false;
    this._sidesReady = false;
    this._raf = 0;
    this._pendingIdx = null;
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
    const { traces, nGuide, nBound, layerVis } = bifTraces(
      this.data,
      this.layersOn,
      this.annotOn
    );
    this._nGuide = nGuide;
    this._nBound = nBound;
    this._layerVis = layerVis;
    const ax = this.data.axis;
    const layout = {
      margin: { t: 36, r: 16, b: 48, l: 56 },
      title: { text: this.data.title, font: { size: 15 } },
      xaxis: {
        title: "Amplitude, T_amp",
        range: ax.xlim,
        tickvals: [0, 5, 10, 15, 20, 24],
        gridcolor: "rgba(0,0,0,0)",
        zeroline: false,
        fixedrange: true,
      },
      yaxis: {
        title: "Trait, x",
        range: ax.ylim,
        tickvals: [-24, -20, -15, -10, -5, 0, 5, 10, 15, 20, 24],
        gridcolor: "rgba(0,0,0,0)",
        zeroline: false,
        fixedrange: true,
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
    // trace order: heatmap(1) + guides + boundaries + layer segments + marker
    const vis = [true];
    for (let i = 0; i < this._nGuide; i++) vis.push(this.annotOn.guides);
    for (let i = 0; i < this._nBound; i++) vis.push(this.annotOn.boundaries);
    for (const layer of this._layerVis || []) vis.push(this.layersOn[layer]);
    vis.push(true);
    Plotly.restyle(this.bifEl, { visible: vis });
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
      Plotly.newPlot(this.logEl, cycleTraces.map((tr) => ({ ...tr })), sideLayout("Density (log)", "n", "log"), PLOT_CFG),
      Plotly.newPlot(this.linEl, cycleTraces.map((tr) => ({ ...tr })), linLayout, PLOT_CFG),
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
  const data = await loadGzipJson(`data/${model}.json.gz`);
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
