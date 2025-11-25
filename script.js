// recon/script.js
import saveform from "saveform";
import { bootstrapAlert } from "bootstrap-alert";
import { examples } from "./config.js";

const $results = document.getElementById('results');
const $exampleList = document.getElementById('example-list');
const $aborFile = document.getElementById('abor-file');
const $iborFile = document.getElementById('ibor-file');
const $status = document.getElementById('llm-status'); // reuse for local status

saveform('#task-form', { exclude: '[type="file"]' });

// Populate examples
examples.forEach(ex => {
  const btn = document.createElement('button');
  btn.className = 'list-group-item list-group-item-action';
  btn.textContent = ex.title;
  btn.addEventListener('click', () => {
    document.getElementById('abor').value = ex.abor;
    document.getElementById('ibor').value = ex.ibor;
  });
  $exampleList.appendChild(btn);
});

// PDF text extraction (if available)
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}
async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text.trim();
}

// File inputs (CSV or PDF)
$aborFile?.addEventListener('change', async (e) => {
  try {
    const f = e.target.files?.[0]; if (!f) return;
    const text = f.name.toLowerCase().endsWith('.pdf') ? await extractPdfText(f) : await f.text();
    document.getElementById('abor').value = text;
    bootstrapAlert({ title: 'ABOR Loaded', body: `Parsed ${f.name}.`, color: 'success' });
  } catch (err) { bootstrapAlert({ title: 'File Error', body: err.message, color: 'warning' }); }
});
$iborFile?.addEventListener('change', async (e) => {
  try {
    const f = e.target.files?.[0]; if (!f) return;
    const text = f.name.toLowerCase().endsWith('.pdf') ? await extractPdfText(f) : await f.text();
    document.getElementById('ibor').value = text;
    bootstrapAlert({ title: 'IBOR Loaded', body: `Parsed ${f.name}.`, color: 'success' });
  } catch (err) { bootstrapAlert({ title: 'File Error', body: err.message, color: 'warning' }); }
});

// ----- Local reconciliation logic (no LLM) -----
function parsePositions(raw) {
  // Detect delimiter: CSV or whitespace; aggregate duplicates.
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], flags: ['Empty input'] };
  const headerLine = lines[0].toLowerCase();
  const isHeader = /instrument/.test(headerLine) && (/qty/.test(headerLine) || /quantity/.test(headerLine));
  const hasComma = /,/.test(lines[0]);
  const rows = [];
  let flags = [];
  const startIdx = isHeader ? 1 : 0;

  function splitFields(line) {
    if (hasComma) return line.split(',').map(s => s.trim());
    // fallback: split by whitespace
    return line.split(/\s+/);
  }

  for (let i = startIdx; i < lines.length; i++) {
    const parts = splitFields(lines[i]);
    if (parts.length < 2) continue;
    const instrument = parts[0];
    // Try to map common column orders: instrument, qty, price, multiplier?, notional?
    const qty = parseFloat(parts[1]);
    const price = parts.length >= 3 ? parseFloat(parts[2]) : NaN;
    const multiplier = parts.find(p => /^\d+(\.\d+)?$/.test(p) && parseFloat(p) > 1e2 && parts.indexOf(p) > 2) ? parseFloat(parts.find(p => /^\d+(\.\d+)?$/.test(p) && parseFloat(p) > 1e2 && parts.indexOf(p) > 2)) : (parts.length >= 4 ? (isFinite(parseFloat(parts[3])) ? parseFloat(parts[3]) : 1) : 1);
    const notional = (isHeader && headerLine.includes('notional'))
      ? (() => { const idx = headerLine.split(',').indexOf('notional'); const v = parts[idx]; return v !== undefined ? parseFloat(v) : NaN; })()
      : (parts.length >= 5 ? parseFloat(parts[4]) : NaN);
    const rowFlags = [];
    if (!isFinite(qty)) rowFlags.push('Bad qty');
    if (!isFinite(price)) rowFlags.push('Missing price');
    rows.push({ instrument, qty: qty || 0, price: isFinite(price) ? price : 0, multiplier: isFinite(multiplier) ? multiplier : 1, notional: isFinite(notional) ? notional : NaN, flags: rowFlags });
  }

  // Aggregate duplicates by instrument
  const byInstr = new Map();
  for (const r of rows) {
    const cur = byInstr.get(r.instrument);
    if (!cur) byInstr.set(r.instrument, { ...r, agg: true, count: 1 });
    else {
      cur.qty += r.qty;
      // Prefer non-zero price; simple last-wins
      if (r.price) cur.price = r.price;
      // Sum notional if provided
      if (isFinite(r.notional)) cur.notional = (isFinite(cur.notional) ? cur.notional : 0) + r.notional;
      cur.count += 1;
      cur.flags.push('Duplicate aggregated');
    }
  }
  return { rows: Array.from(byInstr.values()), flags };
}

function classify(instrument) {
  const id = instrument.toUpperCase();
  if (id.startsWith('CASH_')) return 'cash';
  if (/^[A-Z]{2}\d{9}[A-Z\d]$/.test(id) || /US\d{9}[A-Z\d]/.test(id)) return 'bond'; // ISIN/CUSIP-ish
  if (/_FUT_|^ES_|^CL_|^EURUSD_/.test(id)) return 'derivative';
  if (/CDS_|IRS_/.test(id)) return 'derivative';
  if (/[A-Z]+\.[A-Z]{1,3}$/.test(id)) return 'equity'; // local market suffix
  if (/(ETF|SPY|QQQ|IVV|GLD)/.test(id)) return 'etf';
  if (/FX|_SPOT|USDINR/.test(id)) return 'fx';
  return 'equity';
}

function computeNotional(row) {
  if (isFinite(row.notional)) return row.notional;
  if (row.price && isFinite(row.qty)) return row.price * row.qty * (row.multiplier || 1);
  return 0;
}

function detectCorporateAction(ab, ib) {
  // Detect simple split/merge: qty ~ 2x and price ~ 0.5x (or inverse)
  if (!ab || !ib) return null;
  const qRatio = ib.qty && ab.qty ? ib.qty / ab.qty : NaN;
  const pRatio = ib.price && ab.price ? ib.price / ab.price : NaN;
  if (isFinite(qRatio) && isFinite(pRatio)) {
    if (Math.abs(qRatio - 2) < 0.05 && Math.abs(pRatio - 0.5) < 0.1) return 'Possible 2-for-1 split';
    if (Math.abs(qRatio - 0.5) < 0.05 && Math.abs(pRatio - 2) < 0.1) return 'Possible 1-for-2 reverse split';
  }
  return null;
}

function reconcile(aborRaw, iborRaw, thresholdFraction) {
  const ab = parsePositions(aborRaw);
  const ib = parsePositions(iborRaw);
  const abMap = new Map(ab.rows.map(r => [r.instrument, r]));
  const ibMap = new Map(ib.rows.map(r => [r.instrument, r]));
  const instruments = new Set([...abMap.keys(), ...ibMap.keys()]);

  // AUM from ABOR (sum abs notional where available)
  let aum = 0;
  for (const r of ab.rows) aum += Math.abs(computeNotional(r));
  if (aum === 0) aum = 1; // avoid div by zero

  const out = [];
  let totalDiff = 0;
  let exceptions = 0;

  for (const instr of instruments) {
    const abr = abMap.get(instr);
    const ibr = ibMap.get(instr);
    const asset = classify(instr);
    const abQty = abr?.qty || 0;
    const ibQty = ibr?.qty || 0;
    const abNot = abr ? computeNotional(abr) : 0;
    const ibNot = ibr ? computeNotional(ibr) : 0;
    const diffQty = ibQty - abQty;
    const diffNot = ibNot - abNot;
    const pctAum = Math.abs(diffNot) / aum;

    const flags = [];
    if (abr?.flags?.length) flags.push(...abr.flags);
    if (ibr?.flags?.length) flags.push(...ibr.flags);
    if ((abr && abr.price === 0 && !isFinite(abr.notional)) || (ibr && ibr.price === 0 && !isFinite(ibr.notional))) flags.push('Missing price/notional');
    const ca = detectCorporateAction(abr, ibr); if (ca) flags.push(ca);
    if (asset === 'fx' && Math.abs(diffQty) > 0 && Math.abs(diffNot) < 1e-6) flags.push('FX rounding');

    const isException = pctAum >= thresholdFraction;
    if (isException) exceptions += 1;
    totalDiff += Math.abs(diffNot);

    out.push({ instrument: instr, asset, abQty, ibQty, diffQty, abNot, ibNot, diffNot, pctAum, flags, isException });
  }

  // Sort by abs diffNot descending by default
  out.sort((a, b) => Math.abs(b.diffNot) - Math.abs(a.diffNot));
  return { rows: out, aum, totalDiff, exceptions, parseFlags: [...ab.flags, ...ib.flags] };
}

// Number formatting
function fmt(n, digits = 2) {
  const s = (isFinite(n) ? n : 0).toFixed(digits);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function buildTable(result) {
  // Controls
  const controls = document.createElement('div');
  controls.className = 'd-flex gap-2 align-items-center my-2';
  controls.innerHTML = `
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="exceptions-only">
      <label class="form-check-label" for="exceptions-only">Exceptions only</label>
    </div>
    <input id="filter" class="form-control form-control-sm" type="search" placeholder="Filter instrument">
  `;

  // Summary
  const summary = document.createElement('div');
  summary.className = 'card my-2';
  summary.innerHTML = `
    <div class="card-body d-flex flex-wrap gap-4">
      <div><div class="text-muted small">ABOR AUM</div><div class="fw-bold">${fmt(result.aum)}</div></div>
      <div><div class="text-muted small">Total Diff Notional</div><div class="fw-bold">${fmt(result.totalDiff)}</div></div>
      <div><div class="text-muted small">Exceptions</div><div class="fw-bold">${result.exceptions}</div></div>
    </div>
  `;

  // Table
  const table = document.createElement('table');
  table.className = 'table table-sm table-hover table-striped table-bordered align-middle';
  table.innerHTML = `
    <thead class="table-light sticky-top">
      <tr>
        <th data-key="instrument">Instrument</th>
        <th data-key="asset">Asset</th>
        <th class="text-end" data-key="abQty">ABOR Qty</th>
        <th class="text-end" data-key="ibQty">IBOR Qty</th>
        <th class="text-end" data-key="diffQty">Diff Qty</th>
        <th class="text-end" data-key="abNot">ABOR Notional</th>
        <th class="text-end" data-key="ibNot">IBOR Notional</th>
        <th class="text-end" data-key="diffNot">Diff Notional</th>
        <th class="text-end" data-key="pctAum">% of AUM</th>
        <th>Flags</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');

  function renderRows(rows) {
    tbody.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      if (r.isException) tr.classList.add('table-danger');
      else if (Math.abs(r.diffNot) > 0) tr.classList.add('table-warning');
      tr.innerHTML = `
        <td>${r.instrument}</td>
        <td><span class="badge bg-secondary">${r.asset}</span></td>
        <td class="text-end">${fmt(r.abQty, 2)}</td>
        <td class="text-end">${fmt(r.ibQty, 2)}</td>
        <td class="text-end">${fmt(r.diffQty, 2)}</td>
        <td class="text-end">${fmt(r.abNot)}</td>
        <td class="text-end">${fmt(r.ibNot)}</td>
        <td class="text-end fw-bold">${fmt(r.diffNot)}</td>
        <td class="text-end">${(r.pctAum*100).toFixed(3)}%</td>
        <td>${r.flags.map(f => `<span class="badge bg-info text-dark me-1">${f}</span>`).join('')}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // initial rows
  renderRows(result.rows);

  // sorting
  let sortKey = 'diffNot'; let sortDir = -1;
  table.querySelectorAll('th[data-key]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key.includes('pct') || key.includes('Qty') || key.includes('Not') || key.includes('diff') ? -1 : 1; }
      const rows = [...result.rows].sort((a, b) => {
        const va = a[sortKey]; const vb = b[sortKey];
        if (typeof va === 'string') return sortDir * va.localeCompare(vb);
        return sortDir * ((va || 0) - (vb || 0));
      });
      renderRows(rows);
    });
  });

  // filters
  const $exceptionsOnly = controls.querySelector('#exceptions-only');
  const $filter = controls.querySelector('#filter');
  function applyFilters() {
    let rows = result.rows;
    if ($exceptionsOnly.checked) rows = rows.filter(r => r.isException);
    const q = $filter.value.trim().toLowerCase();
    if (q) rows = rows.filter(r => r.instrument.toLowerCase().includes(q));
    renderRows(rows);
  }
  $exceptionsOnly.addEventListener('change', applyFilters);
  $filter.addEventListener('input', applyFilters);

  const container = document.createElement('div');
  container.appendChild(controls);
  container.appendChild(summary);
  container.appendChild(table);
  return container;
}

// Submit handler: compute locally and render
document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const abor = document.getElementById('abor').value.trim();
    const ibor = document.getElementById('ibor').value.trim();
    const threshold = parseFloat(document.getElementById('threshold').value || '0.01');
    if (!abor || !ibor) { bootstrapAlert({ title: 'Input Required', body: 'Provide ABOR and IBOR (CSV or PDF).', color: 'warning' }); return; }

    $status.textContent = 'Computing reconciliation locally...';
    const res = reconcile(abor, ibor, threshold);
    $results.innerHTML = '';
    $results.appendChild(buildTable(res));
    const pf = res.parseFlags.length ? ` Parse flags: ${res.parseFlags.join('; ')}` : '';
    $status.textContent = `Completed. Rows: ${res.rows.length}.${pf}`;
  } catch (err) {
    $status.textContent = '';
    bootstrapAlert({ title: 'Error', body: err.message, color: 'danger' });
  }
});
