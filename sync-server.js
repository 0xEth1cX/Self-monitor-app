#!/usr/bin/env node
/**
 * ⚡ Discipline Hub — Sync Server
 * 
 * Run this on any machine (your PC, a VPS, or free hosting).
 * Both your PC browser and Android app connect to it.
 * Data syncs in real-time between all devices.
 * 
 * USAGE:
 *   node sync-server.js
 * 
 * Then in the app's Settings → Sync, enter:
 *   Server URL: http://your-ip:3456
 *   Sync Token: (the token printed on startup)
 *
 * For worldwide access, deploy to:
 *   - Railway.app (free) 
 *   - Render.com (free)
 *   - Any VPS with: node sync-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── CONFIG ───
const PORT = process.env.PORT || 3456;
const DATA_FILE = path.join(__dirname, 'discipline-hub-data.json');
const TOKEN = process.env.SYNC_TOKEN || crypto.randomBytes(16).toString('hex');

// ─── DATA STORE ───
let store = {};
try {
  if (fs.existsSync(DATA_FILE)) {
    store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
} catch { store = {}; }

function saveStore() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2)); } catch (e) { console.error('Save error:', e.message); }
}

// Track last modified time per key
let lastModified = {};

// ─── SERVER ───
const server = http.createServer((req, res) => {
  // CORS — allow any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Auth check
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid token' }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // GET /api/sync — return all data + timestamps
  if (req.method === 'GET' && pathname === '/api/sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: store, timestamps: lastModified, serverTime: Date.now() }));
    return;
  }

  // GET /api/sync/:key — return single key
  if (req.method === 'GET' && pathname.startsWith('/api/sync/')) {
    const key = decodeURIComponent(pathname.slice(10));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ key, value: store[key] || null, modified: lastModified[key] || 0 }));
    return;
  }

  // POST /api/sync — bulk save all data
  if (req.method === 'POST' && pathname === '/api/sync') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const now = Date.now();
        
        if (payload.data) {
          // Merge: for each key, accept if client timestamp is newer
          for (const [key, value] of Object.entries(payload.data)) {
            const clientTime = (payload.timestamps && payload.timestamps[key]) || now;
            const serverTime = lastModified[key] || 0;
            
            if (clientTime >= serverTime) {
              store[key] = value;
              lastModified[key] = clientTime;
            }
          }
          saveStore();
        }
        
        // Return merged state
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: store, timestamps: lastModified, serverTime: now }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // PUT /api/sync/:key — save single key
  if (req.method === 'PUT' && pathname.startsWith('/api/sync/')) {
    const key = decodeURIComponent(pathname.slice(10));
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { value, timestamp } = JSON.parse(body);
        const clientTime = timestamp || Date.now();
        const serverTime = lastModified[key] || 0;
        
        if (clientTime >= serverTime) {
          store[key] = value;
          lastModified[key] = clientTime;
          saveStore();
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ key, value: store[key], modified: lastModified[key] }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', keys: Object.keys(store).length, uptime: process.uptime() }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ⚡ Discipline Hub Sync Server');
  console.log('  ─────────────────────────────');
  console.log(`  🌐 Running on:    http://localhost:${PORT}`);
  console.log(`  🔑 Sync Token:    ${TOKEN}`);
  console.log(`  💾 Data file:     ${DATA_FILE}`);
  console.log(`  📦 Stored keys:   ${Object.keys(store).length}`);
  console.log('');
  console.log('  Copy these into Settings → Sync in your app:');
  console.log(`    Server URL:  http://localhost:${PORT}`);
  console.log(`    Token:       ${TOKEN}`);
  console.log('');
  console.log('  For remote access, use your public IP or deploy to Railway/Render.');
  console.log('');
});
