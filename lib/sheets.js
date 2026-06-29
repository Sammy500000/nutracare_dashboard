'use strict';
/* ------------------------------------------------------------------ *
 * Google Sheets bridge for the VNLS investor dashboard.
 *
 * One clean "Dashboard" tab is the single source of truth. It is
 * auto-created and seeded on first access. The dashboard reads the whole
 * tab (GET) and writes the editable INPUT rows back (POST). Editing any
 * value in the tab updates the dashboard on its next sync.
 * ------------------------------------------------------------------ */
const { google } = require('googleapis');

/* ===== Canonical seed values (reconciled to the source workbook) ===== */
const IE_KEYS = [
  'Marketing & Advertising', 'HCP Detailing & Medical Engagement', 'Distribution & Logistics',
  'R&D / Regulatory / Compliance', 'G&A / Operations Overheads', 'Employee Cost', 'Contingency Fund (5%)'
];

const SEED = {
  // --- INPUTS (editable; written back from the dashboard) ---
  'input.ct1': 4, 'input.ct2': 15, 'input.cdays': 25, 'input.cmonths': 12, 'input.kgday': 40000,
  'input.gPP': 500, 'input.gLP': 500, 'input.gIF': 400, 'input.gCN': 400,
  'input.plants': [0, 1, 3, 6, 9], 'input.scenario': 'base',
  'ie.Marketing & Advertising': [3.711, 23.061, 48.388, 85.067, 148.570],
  'ie.HCP Detailing & Medical Engagement': [1.855, 5.815, 14.834, 67.336, 131.192],
  'ie.Distribution & Logistics': [2.442, 3.563, 22.694, 52.533, 98.342],
  'ie.R&D / Regulatory / Compliance': [1.855, 11.432, 14.267, 49.393, 41.099],
  'ie.G&A / Operations Overheads': [1.855, 8.574, 18.967, 49.393, 92.463],
  'ie.Employee Cost': [4.144, 18.824, 45.229, 115.777, 199.742],
  'ie.Contingency Fund (5%)': [1.379, 6.186, 14.176, 36.161, 61.154],
  // --- MODEL DATA (edit to update the dashboard) ---
  'base.contractRev': [61.844, 188.528, 0, 0, 0],
  'base.inhouseRev': [0, 97.264, 632.228, 1646.427, 3082.111],
  'base.thirdpartyRev': [0, 3.695, 27.457, 73.546, 140.228],
  'base.otherIncome': [0, -0.051, 0.255, 1.667, 6.281],
  'base.contractCOGS': [44.502, 128.026, 0, 0, 0],
  'base.inhouseCOGS': [0, 47.534, 305.716, 796.137, 1490.368],
  'base.dep': [0, 0.567, 1.702, 3.404, 5.107],
  'base.finCost': [0, 0, 0, 10.476, 24.352],
  'base.capReq': [21.585, 54.127, 198.671, 273.183, 273.183],
  'base.capex': [1.2, 23.361, 46.721, 70.082, 70.082],
  'base.capEmployed': [21.59, 72.28, 387.42, 644.16, 1210.63],
  'base.equity': [0.18, 0.256, 123.73, 256.99, 603.46],
  'base.taxRate': 0.25, 'base.wacc': 0.09,
  'base.basePlants': [0, 1, 3, 6, 9], 'base.baseKgDay': 40000,
  'base.gram.PP': 500, 'base.gram.LP': 500, 'base.gram.IF': 400, 'base.gram.CN': 400,
  'cy1.tons': 4, 'cy1.days': 300,
  'cy1.ratio.PP': 12, 'cy1.ratio.LP': 10, 'cy1.ratio.CN': 24,
  'cy1.gram.PP': 500, 'cy1.gram.LP': 500, 'cy1.gram.CN': 400,
  'cy1.price.PP': 242, 'cy1.price.LP': 286, 'cy1.price.CN': 203,
  'cy1.cost.PP': 201.594, 'cy1.cost.LP': 181.835, 'cy1.cost.CN': 143.08,
  'inhw.PP': 0.205, 'inhw.LP': 0.171, 'inhw.IF': 0.34, 'inhw.CN': 0.284,
  'pop.pregnant': [52171, 185213, 324365, 844367, 1581468],
  'pop.lactating': [52214, 186321, 324973, 847393, 1585735],
  'pop.infantFormula': [0, 0, 244800, 637704, 1193298],
  'pop.infantFood': [0, 199445, 244722, 637611, 1193644],
  'pop.children': [32720, 232870, 405960, 1057428, 1979820],
  'ch.csr': [49.48, 206.92, 368.77, 891.73, 1540.92],
  'ch.sales': [12.37, 68.97, 158.04, 480.16, 1027.28],
  'tier.t1': [0, 9.9, 56.78, 147.86, 276.8],
  'tier.t2': [0, 0, 48.64, 126.67, 237.12],
  'tier.t3': [61.84, 275.89, 526.81, 1371.9, 2568.19],
  'cat.Pregnancy': [15.15, 45.01, 100.36, 261.36, 489.27],
  'cat.Lactation': [14.92, 44.4, 98.64, 256.88, 480.88],
  'cat.Infant Formula': [0, 49.01, 112.54, 293.07, 548.63],
  'cat.Infant Complementary': [0, 52.44, 105.2, 273.96, 512.85],
  'cat.Children': [31.77, 94.94, 215.48, 561.16, 1050.48]
};

/* Ordered tab layout: section headers + keyed rows */
const SCHEMA = [
  { sec: '— INPUTS · editable; the dashboard writes these back —' },
  { key: 'input.ct1' }, { key: 'input.ct2' }, { key: 'input.cdays' }, { key: 'input.cmonths' },
  { key: 'input.kgday' }, { key: 'input.gPP' }, { key: 'input.gLP' }, { key: 'input.gIF' }, { key: 'input.gCN' },
  { key: 'input.plants' }, { key: 'input.scenario' },
  ...IE_KEYS.map(n => ({ key: 'ie.' + n })),
  { sec: '— MODEL DATA · edit any value to update the dashboard —' },
  { key: 'base.contractRev' }, { key: 'base.inhouseRev' }, { key: 'base.thirdpartyRev' }, { key: 'base.otherIncome' },
  { key: 'base.contractCOGS' }, { key: 'base.inhouseCOGS' }, { key: 'base.dep' }, { key: 'base.finCost' },
  { key: 'base.capReq' }, { key: 'base.capex' }, { key: 'base.capEmployed' }, { key: 'base.equity' },
  { key: 'base.taxRate' }, { key: 'base.wacc' }, { key: 'base.basePlants' }, { key: 'base.baseKgDay' },
  { key: 'base.gram.PP' }, { key: 'base.gram.LP' }, { key: 'base.gram.IF' }, { key: 'base.gram.CN' },
  { key: 'cy1.tons' }, { key: 'cy1.days' },
  { key: 'cy1.ratio.PP' }, { key: 'cy1.ratio.LP' }, { key: 'cy1.ratio.CN' },
  { key: 'cy1.gram.PP' }, { key: 'cy1.gram.LP' }, { key: 'cy1.gram.CN' },
  { key: 'cy1.price.PP' }, { key: 'cy1.price.LP' }, { key: 'cy1.price.CN' },
  { key: 'cy1.cost.PP' }, { key: 'cy1.cost.LP' }, { key: 'cy1.cost.CN' },
  { key: 'inhw.PP' }, { key: 'inhw.LP' }, { key: 'inhw.IF' }, { key: 'inhw.CN' },
  { sec: '— REACH / IMPACT · people served per year —' },
  { key: 'pop.pregnant' }, { key: 'pop.lactating' }, { key: 'pop.infantFormula' }, { key: 'pop.infantFood' }, { key: 'pop.children' },
  { sec: '— CHANNEL / TIER / CATEGORY revenue (₹ Cr) —' },
  { key: 'ch.csr' }, { key: 'ch.sales' },
  { key: 'tier.t1' }, { key: 'tier.t2' }, { key: 'tier.t3' },
  { key: 'cat.Pregnancy' }, { key: 'cat.Lactation' }, { key: 'cat.Infant Formula' }, { key: 'cat.Infant Complementary' }, { key: 'cat.Children' }
];

const NOTES = {
  'input.ct1': 'Contract tonnes/day — Year 1', 'input.ct2': 'Contract tonnes/day — Year 2',
  'input.cdays': 'Working days/month (contract)', 'input.cmonths': 'Working months in Year 1',
  'input.kgday': 'In-house capacity kg/day per plant', 'input.plants': 'Operating plants by year',
  'input.scenario': 'base | conservative | aggressive',
  'base.taxRate': 'Effective tax rate', 'base.wacc': 'Weighted avg cost of capital'
};

/* ===== auth / client ===== */
function loadCreds() {
  let raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim();
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var not set');
  if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8'); // allow base64
  const c = JSON.parse(raw);
  if (c.private_key) c.private_key = c.private_key.replace(/\\n/g, '\n');
  return c;
}
let _sheets;
async function client() {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error('SHEET_ID env var not set');
  const tab = process.env.DASHBOARD_TAB || 'Dashboard';
  if (!_sheets) {
    const c = loadCreds();
    const auth = new google.auth.JWT(c.client_email, null, c.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
    await auth.authorize();
    _sheets = google.sheets({ version: 'v4', auth });
  }
  return { sheets: _sheets, id, tab };
}

/* ===== helpers ===== */
const num = x => { const n = Number(x); return isFinite(n) ? n : 0; };
const colEnd = len => String.fromCharCode(66 + len - 1); // 66='B'

function makeGetter(map) {
  const seed = k => SEED[k];
  return {
    n: k => { const v = map[k]; const n = (v && v[0] !== '' && v[0] != null) ? Number(v[0]) : NaN; return isFinite(n) ? n : Number(seed(k)); },
    t: k => { const v = map[k]; return (v && v[0] != null && v[0] !== '') ? String(v[0]) : String(seed(k) == null ? '' : seed(k)); },
    s: k => { const v = map[k], s = seed(k) || [0, 0, 0, 0, 0]; const out = [];
      for (let i = 0; i < 5; i++) { const c = v && v[i]; const n = (c === '' || c == null) ? (s[i] == null ? 0 : s[i]) : Number(c); out.push(isFinite(n) ? n : (s[i] == null ? 0 : s[i])); }
      return out; }
  };
}

function assemble(g) {
  const model = {
    base: {
      contractRev: g.s('base.contractRev'), inhouseRev: g.s('base.inhouseRev'),
      thirdpartyRev: g.s('base.thirdpartyRev'), otherIncome: g.s('base.otherIncome'),
      contractCOGS: g.s('base.contractCOGS'), inhouseCOGS: g.s('base.inhouseCOGS'),
      dep: g.s('base.dep'), finCost: g.s('base.finCost'), capReq: g.s('base.capReq'),
      capex: g.s('base.capex'), capEmployed: g.s('base.capEmployed'), equity: g.s('base.equity'),
      taxRate: g.n('base.taxRate'), wacc: g.n('base.wacc'),
      basePlants: g.s('base.basePlants'), baseKgDay: g.n('base.baseKgDay'),
      baseGram: { PP: g.n('base.gram.PP'), LP: g.n('base.gram.LP'), IF: g.n('base.gram.IF'), CN: g.n('base.gram.CN') },
      contractY1: {
        ratio: { PP: g.n('cy1.ratio.PP'), LP: g.n('cy1.ratio.LP'), CN: g.n('cy1.ratio.CN') },
        gram: { PP: g.n('cy1.gram.PP'), LP: g.n('cy1.gram.LP'), CN: g.n('cy1.gram.CN') },
        price: { PP: g.n('cy1.price.PP'), LP: g.n('cy1.price.LP'), CN: g.n('cy1.price.CN') },
        cost: { PP: g.n('cy1.cost.PP'), LP: g.n('cy1.cost.LP'), CN: g.n('cy1.cost.CN') },
        days: g.n('cy1.days'), tons: g.n('cy1.tons')
      }
    },
    inhProdw: { PP: g.n('inhw.PP'), LP: g.n('inhw.LP'), IF: g.n('inhw.IF'), CN: g.n('inhw.CN') },
    pop: { pregnant: g.s('pop.pregnant'), lactating: g.s('pop.lactating'), infantFormula: g.s('pop.infantFormula'), infantFood: g.s('pop.infantFood'), children: g.s('pop.children') },
    ch: { csr: g.s('ch.csr'), sales: g.s('ch.sales') },
    tier: { t1: g.s('tier.t1'), t2: g.s('tier.t2'), t3: g.s('tier.t3') },
    cat: { Pregnancy: g.s('cat.Pregnancy'), Lactation: g.s('cat.Lactation'), 'Infant Formula': g.s('cat.Infant Formula'), 'Infant Complementary': g.s('cat.Infant Complementary'), Children: g.s('cat.Children') }
  };
  const inputs = {
    ct1: g.n('input.ct1'), ct2: g.n('input.ct2'), cdays: g.n('input.cdays'), cmonths: g.n('input.cmonths'), kgday: g.n('input.kgday'),
    gPP: g.n('input.gPP'), gLP: g.n('input.gLP'), gIF: g.n('input.gIF'), gCN: g.n('input.gCN'),
    plants: g.s('input.plants'), scenario: g.t('input.scenario'), ie: {}
  };
  IE_KEYS.forEach(n => { inputs.ie[n] = g.s('ie.' + n); });
  return { model, inputs };
}

/* ===== tab lifecycle ===== */
function seedRows() {
  const rows = [['Key', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Notes']];
  for (const e of SCHEMA) {
    if (e.sec) { rows.push([e.sec, '', '', '', '', '', '']); continue; }
    const v = SEED[e.key];
    let cells = Array.isArray(v) ? [e.key, ...v] : [e.key, v];
    while (cells.length < 6) cells.push('');
    cells.push(NOTES[e.key] || '');
    rows.push(cells);
  }
  return rows;
}
async function seed(sheets, id, tab) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: `${tab}!A1`, valueInputOption: 'RAW', requestBody: { values: seedRows() }
  });
}
async function ensureTab(sheets, id, tab) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  const exists = (meta.data.sheets || []).some(s => s.properties.title === tab);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } } } }] }
    });
    await seed(sheets, id, tab);
    return true;
  }
  const a = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tab}!A2:A2` });
  if (!a.data.values || !a.data.values.length) { await seed(sheets, id, tab); return true; }
  return false;
}

/* ===== public API ===== */
async function ensureAndRead() {
  const { sheets, id, tab } = await client();
  const initialized = await ensureTab(sheets, id, tab);
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tab}!A1:G400` });
  const rows = resp.data.values || [];
  const map = {};
  rows.forEach(r => { const k = r[0]; if (k && Object.prototype.hasOwnProperty.call(SEED, k)) map[k] = r.slice(1, 6); });
  const { model, inputs } = assemble(makeGetter(map));
  return { initialized, model, inputs };
}

async function writeInputs(inputs) {
  inputs = inputs || {};
  const { sheets, id, tab } = await client();
  await ensureTab(sheets, id, tab);
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${tab}!A1:A400` });
  const colA = (resp.data.values || []).map(r => r[0]);
  const rowOf = {}; colA.forEach((k, i) => { if (k) rowOf[k] = i + 1; });
  const data = [];
  const put = (key, arr) => { const row = rowOf[key]; if (!row) return; data.push({ range: `${tab}!B${row}:${colEnd(arr.length)}${row}`, values: [arr] }); };
  const scalars = { 'input.ct1': 'ct1', 'input.ct2': 'ct2', 'input.cdays': 'cdays', 'input.cmonths': 'cmonths', 'input.kgday': 'kgday', 'input.gPP': 'gPP', 'input.gLP': 'gLP', 'input.gIF': 'gIF', 'input.gCN': 'gCN' };
  Object.keys(scalars).forEach(k => { const f = scalars[k]; if (inputs[f] != null) put(k, [num(inputs[f])]); });
  if (Array.isArray(inputs.plants)) put('input.plants', inputs.plants.map(num));
  if (inputs.scenario != null) put('input.scenario', [String(inputs.scenario)]);
  if (inputs.ie) IE_KEYS.forEach(n => { if (Array.isArray(inputs.ie[n])) put('ie.' + n, inputs.ie[n].map(num)); });
  if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: 'RAW', data } });
  return { written: data.length };
}

module.exports = { ensureAndRead, writeInputs };
