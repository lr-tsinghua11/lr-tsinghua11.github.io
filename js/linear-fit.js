(function(root) {
  'use strict';

  const LIMIT = 2000;
  const EXAMPLE = 'x,y\n0,0.08\n1,2.14\n2,4.07\n3,6.21\n4,8.12\n5,10.20';
  const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

  function parseData(raw) {
    const points = [];
    let header = false;
    String(raw).split(/\r?\n/).forEach((line, index) => {
      const text = line.trim();
      if (!text) return;
      const columns = text.split(/[\s,，;；]+/);
      if (!header && !points.length && columns.length === 2 && /^x$/i.test(columns[0]) && /^y$/i.test(columns[1])) {
        header = true; return;
      }
      if (columns.length !== 2 || columns.some(value => !numberPattern.test(value) || !Number.isFinite(Number(value)))) {
        throw new Error(`第 ${index + 1} 行需要两列有限数值，例如 1.5, 3.2。`);
      }
      points.push({x: Number(columns[0]), y: Number(columns[1])});
      if (points.length > LIMIT) throw new Error(`单次最多计算 ${LIMIT.toLocaleString('en-US')} 组数据。`);
    });
    if (points.length < 3) throw new Error('至少输入 3 组数据，才能同时估计拟合参数和标准误差。');
    return points;
  }

  function sum(values) {
    let total = 0, correction = 0;
    for (const value of values) {
      const adjusted = value - correction, next = total + adjusted;
      correction = (next - total) - adjusted; total = next;
    }
    return total;
  }

  function fitLinear(points, throughOrigin = false) {
    if (points.length < 3 || points.length > LIMIT || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      throw new Error('请输入 3 至 2,000 组有限数值。');
    }
    const n = points.length, x0 = points[0].x, y0 = points[0].y;
    const meanDX = sum(points.map(p => p.x - x0)) / n;
    const meanDY = sum(points.map(p => p.y - y0)) / n;
    const meanX = x0 + meanDX, meanY = y0 + meanDY;
    const dx = points.map(p => (p.x - x0) - meanDX);
    const dy = points.map(p => (p.y - y0) - meanDY);
    const sxx = throughOrigin ? sum(points.map(p => p.x * p.x)) : sum(dx.map(x => x * x));
    const sxy = throughOrigin ? sum(points.map(p => p.x * p.y)) : sum(dx.map((x, i) => x * dy[i]));
    if (sxx === 0) throw new Error(throughOrigin ? 'x 不能全部为 0，否则无法确定斜率。' : 'x 不能全部相同，否则无法确定斜率。');
    if (!Number.isFinite(sxx) || !Number.isFinite(sxy) || sxx < 0) throw new Error('数值范围过大或过小，请调整单位后再拟合。');
    const slope = sxy / sxx, intercept = throughOrigin ? 0 : meanY - slope * meanX;
    // Predict around the data mean to avoid cancellation for large x offsets.
    const predict = x => throughOrigin ? slope * x : meanY + slope * ((x - x0) - meanDX);
    const rows = points.map(p => ({...p, fitted: predict(p.x), residual: p.y - predict(p.x)}));
    const sse = sum(rows.map(p => p.residual * p.residual));
    const total = throughOrigin ? sum(points.map(p => p.y * p.y)) : sum(dy.map(y => y * y));
    const variance = sse / (n - (throughOrigin ? 1 : 2));
    const slopeSE = Math.sqrt(variance / sxx);
    const interceptSE = throughOrigin ? null : Math.sqrt(variance * (1 / n + meanX * meanX / sxx));
    if (![slope, intercept, sse, total, slopeSE, interceptSE ?? 0].every(Number.isFinite)) {
      throw new Error('数值范围过大或过小，请调整单位后再拟合。');
    }
    return {n, throughOrigin, slope, intercept, slopeSE, interceptSE, residualSE: Math.sqrt(variance),
      r2: total === 0 ? null : 1 - sse / total, sse, rows, predict};
  }

  function format(value, digits = 6) {
    if (value === null || value === undefined) return '—';
    if (value === 0) return '0';
    const magnitude = Math.abs(value);
    return magnitude >= 1e6 || magnitude < 1e-4 ? value.toExponential(digits - 1).replace(/0+e/, 'e').replace(/\.e/, 'e') : String(Number(value.toPrecision(digits)));
  }

  function equation(result) {
    return `y = ${format(result.slope)}x` + (result.throughOrigin ? '' : ` ${result.intercept < 0 ? '−' : '+'} ${format(Math.abs(result.intercept))}`);
  }

  function csv(result) {
    return 'x,y,fitted_y,residual\n' + result.rows.map(p => [p.x, p.y, p.fitted, p.residual].join(',')).join('\n') + '\n';
  }

  function svg(result) {
    const W = 600, H = 340, L = 76, R = 22, T = 32, B = 58;
    const xs = result.rows.map(p => p.x), ys = result.rows.map(p => p.y);
    if (result.throughOrigin) { xs.push(0); ys.push(0); }
    let xmin = Math.min(...xs), xmax = Math.max(...xs);
    const xpad = xmax === xmin ? Math.max(1, Math.abs(xmin) * 0.1) : (xmax - xmin) * 0.08;
    xmin -= xpad; xmax += xpad;
    ys.push(result.predict(xmin), result.predict(xmax));
    let ymin = Math.min(...ys), ymax = Math.max(...ys);
    const ypad = ymax === ymin ? Math.max(1, Math.abs(ymin) * 0.1) : (ymax - ymin) * 0.12;
    ymin -= ypad; ymax += ypad;
    const px = x => L + (x - xmin) / (xmax - xmin) * (W - L - R);
    const py = y => H - B - (y - ymin) / (ymax - ymin) * (H - T - B);
    const xOffset = Math.abs(xmin) > Math.abs(xmax - xmin) * 1e4 ? result.rows[0].x : 0;
    const yOffset = Math.abs(ymin) > Math.abs(ymax - ymin) * 1e4 ? result.rows[0].y : 0;
    const lines = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="数据散点与最小二乘拟合直线">`,
      `<title>${equation(result)}; n = ${result.n}</title>`,
      '<desc>蓝紫色圆点为输入数据，蓝色直线为最小二乘拟合结果。</desc>',
      `<rect class="fit-plot-background" width="${W}" height="${H}" fill="#ffffff" rx="5"/>`,
      '<g class="fit-plot-labels" font-family="Arial, sans-serif" font-size="17" fill="#4a5770">'
    ];
    for (let i = 0; i <= 4; i++) {
      const x = xmin + i / 4 * (xmax - xmin), y = ymin + i / 4 * (ymax - ymin);
      lines.push(`<path class="fit-plot-grid" d="M${px(x).toFixed(2)} ${T}V${H - B} M${L} ${py(y).toFixed(2)}H${W - R}" stroke="#e7ebf3" fill="none"/>`);
      lines.push(`<text x="${px(x).toFixed(2)}" y="${H - B + 26}" text-anchor="middle">${format(x - xOffset, 4)}</text>`);
      lines.push(`<text x="${L - 12}" y="${(py(y) + 6).toFixed(2)}" text-anchor="end">${format(y - yOffset, 4)}</text>`);
    }
    lines.push(`<path class="fit-plot-axis" d="M${L} ${T}V${H - B}H${W - R}" stroke="#8491a8" fill="none"/>`);
    lines.push(`<path class="fit-plot-line" d="M${px(xmin).toFixed(2)} ${py(result.predict(xmin)).toFixed(2)} L${px(xmax).toFixed(2)} ${py(result.predict(xmax)).toFixed(2)}" stroke="#506faa" stroke-width="2.8" fill="none"/>`);
    for (const p of result.rows) lines.push(`<circle class="fit-plot-point" cx="${px(p.x).toFixed(2)}" cy="${py(p.y).toFixed(2)}" r="4.4" fill="#7865ad" fill-opacity=".8" stroke="white" stroke-width="1"/>`);
    lines.push(`<text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">${xOffset ? 'x − ' + format(xOffset) : 'x'}</text>`);
    lines.push(`<text x="${L}" y="20">${yOffset ? 'y − ' + format(yOffset) : 'y'}</text>`);
    lines.push('</g></svg>');
    return lines.join('');
  }

  const api = {parseData, fitLinear, format, equation, csv, svg};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || !root.document) return;
  root.LRLinearFit = api;
  const panel = root.document.querySelector('[data-linear-fit]');
  if (!panel) return;
  const get = id => root.document.getElementById(id);
  let lastResult = null, isExample = true;
  function invalidate() {
    lastResult = null; isExample = false;
    get('fit-results').hidden = true; get('fit-error').hidden = true;
    get('fit-svg').disabled = get('fit-csv').disabled = true;
    get('fit-status').textContent = '数据已修改，请重新计算';
  }
  function calculate(event) {
    if (event) event.preventDefault();
    lastResult = null;
    get('fit-results').hidden = true; get('fit-error').hidden = true;
    get('fit-svg').disabled = get('fit-csv').disabled = true;
    try {
      const points = parseData(get('fit-points').value);
      const result = fitLinear(points, panel.querySelector('[name="fit-model"]:checked').value === 'origin');
      get('fit-equation').textContent = equation(result);
      get('fit-chart').innerHTML = svg(result);
      for (const [id, value] of Object.entries({'fit-slope': result.slope, 'fit-intercept': result.intercept,
        'fit-r2': result.r2, 'fit-slope-error': result.slopeSE, 'fit-intercept-error': result.interceptSE, 'fit-residual-error': result.residualSE})) {
        get(id).textContent = format(value);
      }
      get('fit-r2-label').textContent = result.throughOrigin ? 'R²（非中心）' : 'R²';
      get('fit-result-note').textContent = result.throughOrigin
        ? '截距固定为 0；此处为非中心 R²，不宜与带截距模型直接比较。'
        : '标准误差仅反映回归残差，不包含仪器误差。';
      get('fit-results').hidden = false;
      get('fit-status').textContent = `${isExample ? '示例数据 · ' : ''}${result.n} 组数据`;
      get('fit-svg').disabled = get('fit-csv').disabled = false;
      lastResult = result;
    } catch (error) {
      get('fit-error').textContent = error.message; get('fit-error').hidden = false;
      get('fit-status').textContent = '请检查输入';
    }
  }
  function download(kind) {
    if (!lastResult) return;
    const text = kind === 'svg' ? '<?xml version="1.0" encoding="UTF-8"?>\n' + svg(lastResult) : csv(lastResult);
    const url = URL.createObjectURL(new Blob([text], {type: kind === 'svg' ? 'image/svg+xml;charset=utf-8' : 'text/csv;charset=utf-8'}));
    const a = root.document.createElement('a'); a.href = url; a.download = `linear-fit.${kind}`;
    root.document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  get('fit-form').addEventListener('submit', calculate);
  get('fit-points').addEventListener('input', invalidate);
  get('fit-points').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') calculate(event);
  });
  panel.querySelectorAll('[name="fit-model"]').forEach(input => input.addEventListener('change', () => { const example = isExample; invalidate(); isExample = example; calculate(); }));
  get('fit-example').addEventListener('click', () => { get('fit-points').value = EXAMPLE; isExample = true; calculate(); });
  get('fit-svg').addEventListener('click', () => download('svg'));
  get('fit-csv').addEventListener('click', () => download('csv'));
  calculate();
})(typeof window === 'undefined' ? null : window);
