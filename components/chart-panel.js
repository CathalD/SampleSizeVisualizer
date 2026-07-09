// Chart.js helpers: reference-line + crosshair plugins, chart creation, and a
// custom HTML legend. Chart is a UMD global loaded from a CDN.

let registered = false;

const referenceLinePlugin = {
  id: 'referenceLines',
  afterDatasetsDraw(chart, _args, opts) {
    const lines = (opts && opts.lines) || [];
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    lines.forEach((line) => {
      const scale = chart.scales[line.scaleID];
      if (!scale) return;
      const vertical = line.axis === 'x';
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash(line.dash || [6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = line.color || '#888';
      if (vertical) {
        const x = scale.getPixelForValue(line.value);
        if (x < chartArea.left || x > chartArea.right) { ctx.restore(); return; }
        ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom);
      } else {
        const y = scale.getPixelForValue(line.value);
        if (y < chartArea.top || y > chartArea.bottom) { ctx.restore(); return; }
        ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y);
      }
      ctx.stroke();
      if (line.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = line.color || '#888';
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = vertical ? 'left' : 'right';
        ctx.textBaseline = 'bottom';
        const x = vertical ? scale.getPixelForValue(line.value) + 4 : chartArea.right - 4;
        const y = vertical ? chartArea.top + 12 : scale.getPixelForValue(line.value) - 2;
        ctx.fillText(line.label, x, y);
      }
      ctx.restore();
    });
  },
};

const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart) {
    const active = chart.tooltip && chart.tooltip.getActiveElements
      ? chart.tooltip.getActiveElements() : [];
    if (!active.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(26,26,46,0.4)';
    ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

function ensurePlugins() {
  if (registered) return;
  // eslint-disable-next-line no-undef
  Chart.register(referenceLinePlugin, crosshairPlugin);
  registered = true;
}

export function createChart(canvas, config) {
  ensurePlugins();
  // eslint-disable-next-line no-undef
  return new Chart(canvas.getContext('2d'), config);
}

export function buildLegend(container, items) {
  container.innerHTML = '';
  items.forEach((it) => {
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    if (it.dash) { swatch.style.borderTop = `2px dashed ${it.color}`; swatch.style.height = '0'; }
    else if (it.band) { swatch.style.background = it.color; swatch.style.height = '10px'; swatch.style.opacity = '0.4'; }
    else swatch.style.background = it.color;
    const lbl = document.createElement('span');
    lbl.textContent = it.label;
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.appendChild(swatch); item.appendChild(lbl);
    container.appendChild(item);
  });
}
