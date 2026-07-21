/* CAD-CADP static bifurcation explorer */

const LAYER_STYLE = {
  stable: { width: 5, opacity: 1 },
  dyn_unstable: { width: 1.2, opacity: 1 },
  inv_unstable: { width: 5, opacity: 0.28 },
};

const NICHE_COLOR = "rgba(77, 92, 110, 0.92)";

async function loadGzipJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const ds = new DecompressionStream("gzip");
  const stream = res.body.pipeThrough(ds);
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

function nicheHeatmap(niche) {
  // Plotly heatmap: z[i][j] with x[j], y[i] — our mask is T-major rows × x cols
  // Transpose so x = T, y = trait
  const z = [];
  const nT = niche.T.length;
  const nX = niche.x.length;
  for (let ix = 0; ix < nX; ix++) {
    const row = new Array(nT);
    for (let iT = 0; iT < nT; iT++) row[iT] = niche.mask[iT][ix];
    z.push(row);
  }
  return {
    type: "heatmap",
    x: niche.T,
    y: niche.x,
    z,
    colorscale: [
      [0, "rgba(255,255,255,0)"],
      [1, NICHE_COLOR],
    ],
    showscale: false,
    hoverinfo: "skip",
    zsmooth: false,
  };
}

function bifTraces(data, layersOn) {
  const traces = [nicheHeatmap(data.niche)];
  const meta = []; // {branch, layer, speciesPoly}

  data.branches.forEach((br, bi) => {
    for (const layer of ["stable", "dyn_unstable", "inv_unstable"]) {
      const style = LAYER_STYLE[layer];
      const polys = br.polylines[layer] || [];
      polys.forEach((poly, pi) => {
        traces.push({
          type: "scatter",
          mode: "lines",
          x: poly.T,
          y: poly.x,
          line: {
            color: br.color,
            width: style.width,
          },
          opacity: style.opacity,
          visible: layersOn[layer],
          name: `${br.S}spp ${layer}`,
          hoverinfo: "skip",
          showlegend: false,
        });
        meta.push({ bi, layer, pi });
      });
    }
  });

  // resident markers (updated live)
  traces.push({
    type: "scatter",
    mode: "markers",
    x: [],
    y: [],
    marker: { color: "#111", size: 9, symbol: "circle" },
    name: "residents",
    hoverinfo: "text",
    showlegend: false,
  });

  return { traces, meta };
}

function emptySideLayout(title, yTitle, yType) {
  return {
    margin: { t: 28, r: 12, b: 36, l: 48 },
    title: { text: title, font: { size: 12 } },
    xaxis: { title: "t", titlefont: { size: 11 }, tickfont: { size: 10 } },
    yaxis: {
      title: yTitle,
      type: yType || "linear",
      titlefont: { size: 11 },
      tickfont: { size: 10 },
    },
    showlegend: false,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(251,252,254,1)",
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
    this.layersOn = {
      stable: true,
      dyn_unstable: true,
      inv_unstable: true,
    };
    this.branchIdx = 0;
    this.pointIdx = 0;
    this._bifReady = false;
  }

  layersFromDom() {
    this.root.querySelectorAll(".toggles input[data-layer]").forEach((el) => {
      this.layersOn[el.dataset.layer] = el.checked;
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
    const br = this.currentBranch();
    return br.points[this.pointIdx];
  }

  async init() {
    this.layersFromDom();
    this.fillMenu();
    this.bind();
    await this.drawBif();
    this.setBranch(this.branchIdx, true);
  }

  bind() {
    this.root.querySelectorAll(".toggles input[data-layer]").forEach((el) => {
      el.addEventListener("change", () => {
        this.layersFromDom();
        this.applyLayerVisibility();
      });
    });
    this.menu.addEventListener("change", () => {
      this.setBranch(Number(this.menu.value), true);
    });
    this.slider.addEventListener("input", () => {
      this.pointIdx = Number(this.slider.value);
      this.updatePoint();
    });
  }

  async drawBif() {
    const { traces } = bifTraces(this.data, this.layersOn);
    const layout = {
      margin: { t: 36, r: 16, b: 48, l: 56 },
      title: { text: this.data.title, font: { size: 15 } },
      xaxis: {
        title: "Amplitude, T_amp",
        range: [0, 26],
        dtick: 5,
        gridcolor: "rgba(0,0,0,0.12)",
        zeroline: false,
      },
      yaxis: {
        title: "Trait, x",
        range: [-26, 26],
        dtick: 5,
        gridcolor: "rgba(0,0,0,0.12)",
        zeroline: false,
        scaleanchor: "x",
        scaleratio: 1,
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#f7fafc",
      showlegend: false,
    };
    const cfg = { responsive: true, displayModeBar: false };
    await Plotly.newPlot(this.bifEl, traces, layout, cfg);
    this._bifReady = true;
  }

  applyLayerVisibility() {
    if (!this._bifReady) return;
    // trace 0 = niche; last = markers; middle = polylines in order
    const updates = { visible: [] };
    const vis = [true];
    this.data.branches.forEach((br) => {
      for (const layer of ["stable", "dyn_unstable", "inv_unstable"]) {
        const n = (br.polylines[layer] || []).length;
        for (let i = 0; i < n; i++) vis.push(this.layersOn[layer]);
      }
    });
    vis.push(true); // markers
    Plotly.restyle(this.bifEl, { visible: vis });
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
    const br = this.currentBranch();
    const pt = this.currentPoint();
    const Tamp = pt.Tamp;
    const xs = pt.xs.filter((v) => Number.isFinite(v));
    this.status.textContent = `idx = ${pt.idx}, T_amp = ${Number(Tamp).toPrecision(4)}`;

    // bif markers
    const nMark = this.bifEl.data.length - 1;
    Plotly.restyle(
      this.bifEl,
      {
        x: [xs.map(() => Tamp)],
        y: [xs],
        text: [xs.map((x) => `x=${Number(x).toPrecision(3)}`)],
      },
      [nMark]
    );

    // cycles
    const t = br.t;
    const cols = this.data.species_colors;
    const logTraces = [];
    const linTraces = [];
    for (let s = 0; s < this.data.S_max; s++) {
      const row = pt.n[s];
      if (!row || !row.some((v) => Number.isFinite(v) && v > 0)) continue;
      const yLog = row.map((v) => (v > 0 && Number.isFinite(v) ? v : null));
      logTraces.push({
        type: "scatter",
        mode: "lines",
        x: t,
        y: yLog,
        line: { color: cols[s] || "#333", width: 2 },
        hoverinfo: "skip",
        showlegend: false,
      });
      linTraces.push({
        type: "scatter",
        mode: "lines",
        x: t,
        y: row.map((v) => (Number.isFinite(v) ? v : null)),
        line: { color: cols[s] || "#333", width: 2 },
        hoverinfo: "skip",
        showlegend: false,
      });
    }
    const cfg = { responsive: true, displayModeBar: false };
    Plotly.react(
      this.logEl,
      logTraces,
      emptySideLayout("Density (log)", "n", "log"),
      cfg
    );
    const linLayout = emptySideLayout("Density", "n", "linear");
    linLayout.yaxis.range = [0, this.data.Rtot];
    Plotly.react(this.linEl, linTraces, linLayout, cfg);

    // fitness
    const fitTraces = [
      {
        type: "scatter",
        mode: "lines",
        x: pt.x_fit,
        y: pt.lambda_fit,
        line: { color: "#2f6fc9", width: 2 },
        hoverinfo: "skip",
        showlegend: false,
      },
      {
        type: "scatter",
        mode: "markers",
        x: xs,
        y: xs.map(() => 0),
        marker: { color: "#ff7f0e", size: 8 },
        hoverinfo: "skip",
        showlegend: false,
      },
      {
        type: "scatter",
        mode: "lines",
        x: [pt.x_fit[0], pt.x_fit[pt.x_fit.length - 1]],
        y: [0, 0],
        line: { color: "#111", width: 1, dash: "dot" },
        hoverinfo: "skip",
        showlegend: false,
      },
    ];
    Plotly.react(
      this.fitEl,
      fitTraces,
      emptySideLayout("Fitness landscape", "λ", "linear"),
      cfg
    );

    // legend
    const preyStart = this.data.predator ? 1 : 0;
    const labels = [];
    for (let i = 0; i < xs.length; i++) {
      const color = cols[preyStart + i] || cols[i] || "#333";
      labels.push(
        `<span style="color:${color}"><i class="swatch"></i>x=${Number(xs[i]).toPrecision(3)}</span>`
      );
    }
    if (this.data.predator) {
      labels.unshift(
        `<span style="color:${cols[0]}"><i class="swatch"></i>predator</span>`
      );
    }
    this.legend.innerHTML = labels.join("");
  }
}

async function main() {
  const panels = [...document.querySelectorAll(".model-panel")];
  for (const el of panels) {
    const model = el.dataset.model;
    const status = el.querySelector(".status");
    try {
      status.textContent = "loading data…";
      const data = await loadGzipJson(`data/${model}.json.gz`);
      const panel = new ModelPanel(el, data);
      await panel.init();
    } catch (err) {
      console.error(err);
      status.textContent = `error: ${err.message}`;
    }
  }
}

main();
