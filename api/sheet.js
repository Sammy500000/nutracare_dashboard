'use strict';
/* Vercel serverless function — two-way bridge between the dashboard and the Google Sheet.
 *   GET  /api/sheet  → { ok, initialized, model, inputs }
 *   POST /api/sheet  → body { inputs } → writes editable inputs back, returns { ok, written }
 * Env vars: GOOGLE_SERVICE_ACCOUNT_KEY, SHEET_ID, [DASHBOARD_TAB], [API_SECRET] */
const { ensureAndRead, writeInputs } = require('../lib/sheets');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vnls-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const secret = process.env.API_SECRET || '';
  if (secret && req.headers['x-vnls-token'] !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const out = await ensureAndRead();
      return res.status(200).json({ ok: true, ...out });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      if (!body || typeof body !== 'object') body = {};
      const r = await writeInputs(body.inputs || {});
      return res.status(200).json({ ok: true, ...r });
    }
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
