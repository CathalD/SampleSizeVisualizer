// Controller: owns the raster canvas, the play/step/reset loop, and tab
// navigation. Structured for multiple modules; ships with one.

import { create as createPrecision } from './modules/precision.js';

class Controller {
  constructor() {
    this.modules = { precision: createPrecision() };
    this.order = ['precision'];
    this.playing = false;
    this.lastTime = 0;
    this.acc = 0;

    this.dom = {
      tabs: document.getElementById('tabs'),
      controls: document.getElementById('controls'),
      readouts: document.getElementById('readouts'),
      charts: document.getElementById('charts'),
      canvas: document.getElementById('sim-canvas'),
      status: document.getElementById('sim-status'),
      play: document.getElementById('btn-play'),
      step: document.getElementById('btn-step'),
      reset: document.getElementById('btn-reset'),
      speed: document.getElementById('sim-speed'),
      speedVal: document.getElementById('speed-val'),
      footer: document.getElementById('footer-eq'),
      callout: document.getElementById('callout'),
    };
    this.ctx = this.dom.canvas.getContext('2d');

    this._buildTabs();
    this._wire();
    this.activate('precision');
    this._sizeCanvas();
    window.addEventListener('resize', () => { this._sizeCanvas(); this.draw(); });
    requestAnimationFrame((t) => this._loop(t));
  }

  _buildTabs() {
    this.order.forEach((id) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.textContent = this.modules[id].title;
      b.dataset.id = id;
      b.addEventListener('click', () => this.activate(id));
      this.dom.tabs.appendChild(b);
    });
  }

  _wire() {
    this.dom.play.addEventListener('click', () => this.togglePlay());
    this.dom.step.addEventListener('click', () => { this.module.addSamples(1); this._status(); this.draw(); });
    this.dom.reset.addEventListener('click', () => this.reset());
    this.dom.speed.addEventListener('input', () => {
      this.module.state.speed = parseFloat(this.dom.speed.value);
      this.dom.speedVal.textContent = this.dom.speed.value;
    });
  }

  _sizeCanvas() {
    const wrap = this.dom.canvas.parentElement;
    const avail = Math.min(wrap.clientWidth || 384, 432);
    const cell = Math.max(4, Math.floor(avail / this.module.cols));
    this.cell = cell;
    this.dom.canvas.width = this.module.cols * cell;
    this.dom.canvas.height = this.module.rows * cell;
  }

  activate(id) {
    const mod = this.modules[id];
    this.module = mod;
    Array.from(this.dom.tabs.children).forEach((b) => b.classList.toggle('active', b.dataset.id === id));

    this.dom.charts.querySelectorAll('canvas').forEach((cv) => {
      const ex = window.Chart && window.Chart.getChart(cv);
      if (ex) ex.destroy();
    });
    this.dom.controls.innerHTML = '';
    this.dom.readouts.innerHTML = '';
    this.dom.charts.innerHTML = '';

    mod.mountReadouts(this.dom.readouts);
    mod.mountCharts(this.dom.charts);
    mod.mountControls(this.dom.controls, this);
    mod._refreshReadouts();

    this.dom.footer.innerHTML = mod.equation;
    this.dom.callout.textContent = mod.callout;
    this.dom.speed.value = mod.state.speed;
    this.dom.speedVal.textContent = mod.state.speed;

    this.pause();
    this._status();
    this.draw();
  }

  redraw() { this._sizeCanvas(); this.draw(); }

  togglePlay() { this.playing ? this.pause() : this.play(); }
  play() { if (this.module.done()) this.reset(); this.playing = true; this.dom.play.textContent = '⏸ Pause'; }
  pause() { this.playing = false; this.dom.play.textContent = '▶ Play'; }

  reset() {
    this.module.reset();
    this.acc = 0;
    this.pause();
    this._status();
    this.draw();
  }

  _loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0);
    if (this.playing) {
      this.acc += this.module.state.speed * dt;
      const k = Math.floor(this.acc);
      if (k >= 1) {
        this.acc -= k;
        const done = this.module.addSamples(k);
        this._status();
        if (done) this.pause();
      }
    }
    this.module.prepareFrame();
    this.draw();
    this.lastTime = now;
    requestAnimationFrame((t) => this._loop(t));
  }

  _status() {
    const N = this.module.maxN || this.module.rows * this.module.cols;
    const n = this.module.n;
    this.dom.status.textContent = `n = ${n} / ${N}  (${((n / N) * 100).toFixed(1)}%)`;
  }

  draw() {
    const { rows, cols } = this.module;
    const cell = this.cell;
    const mask = this.module.sampledMask();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.ctx.fillStyle = this.module.getCellColor(r, c);
        this.ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
    // sample-location markers
    if (cell >= 5) {
      this.ctx.fillStyle = 'rgba(20,20,30,0.85)';
      const rad = Math.max(1, cell * 0.16);
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        const r = Math.floor(i / cols), c = i % cols;
        this.ctx.beginPath();
        this.ctx.arc(c * cell + cell / 2, r * cell + cell / 2, rad, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => new Controller());
