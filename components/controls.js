// DOM helpers for parameter controls. No framework.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined) {
      node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function slider(opts) {
  const fmt = opts.format || ((v) => v);
  const valSpan = el('span', { class: 'ctrl-val' });
  const input = el('input', {
    type: 'range', min: opts.min, max: opts.max, step: opts.step, value: opts.value,
  });
  const render = () => {
    valSpan.textContent = `${fmt(parseFloat(input.value))}${opts.unit ? ' ' + opts.unit : ''}`;
  };
  input.addEventListener('input', () => { render(); opts.onInput && opts.onInput(parseFloat(input.value)); });
  render();
  const root = el('div', { class: 'ctrl' }, [
    el('div', { class: 'ctrl-head' }, [el('label', { text: opts.label }), valSpan]),
    input,
  ]);
  return { root, input, render, set: (v) => { input.value = v; render(); }, get: () => parseFloat(input.value) };
}

export function segmented(opts) {
  const buttons = [];
  const wrap = el('div', { class: 'segmented' });
  opts.options.forEach((o) => {
    const b = el('button', {
      class: 'seg-btn' + (o.value === opts.value ? ' active' : ''), type: 'button', text: o.label,
    });
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      opts.onChange && opts.onChange(o.value);
    });
    buttons.push(b);
    wrap.appendChild(b);
  });
  return el('div', { class: 'ctrl' }, [
    el('div', { class: 'ctrl-head' }, [el('label', { text: opts.label })]),
    wrap,
  ]);
}

export function select(opts) {
  const sel = el('select', { class: 'ctrl-select' });
  opts.options.forEach((o) => {
    const op = el('option', { value: o.value, text: o.label });
    if (o.value === opts.value) op.selected = true;
    sel.appendChild(op);
  });
  sel.addEventListener('change', () => opts.onChange && opts.onChange(sel.value));
  return {
    root: el('div', { class: 'ctrl' }, [
      el('div', { class: 'ctrl-head' }, [el('label', { text: opts.label })]),
      sel,
    ]),
    el: sel,
  };
}

export function metricCard(label, hint) {
  const value = el('div', { class: 'metric-val', text: '—' });
  const root = el('div', { class: 'metric-card' }, [
    el('div', { class: 'metric-label', text: label }),
    value,
    hint ? el('div', { class: 'metric-hint', text: hint }) : null,
  ]);
  return { root, set: (v) => (value.textContent = v) };
}

export function button(label, onClick) {
  return el('button', { class: 'action-btn', type: 'button', onClick }, [label]);
}
