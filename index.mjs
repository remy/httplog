import http from 'http';
import findMyWay from 'find-my-way';
import Database from 'better-sqlite3';

import crypto from 'crypto';

function generateSHA(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const router = findMyWay({
  ignoreTrailingSlash: true,
});
const db = new Database('httplog.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    key TEXT,
    created_by_ip TEXT,
    created_by_sha TEXT,
    response TEXT
)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_key ON endpoints (key)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    key TEXT,
    ip TEXT,
    request_sha TEXT,
    metadata TEXT
)`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_key ON requests (key)`);

const create = db.prepare(
  `INSERT INTO endpoints (key, response, created_by_ip, created_by_sha) VALUES (?, ?, ?, ?)`
);
const log = db.prepare(
  `INSERT INTO requests (key, ip, request_sha, metadata) VALUES (?, ?, ?, ?)`
);
const get = db.prepare(`SELECT * FROM endpoints WHERE key = ?`);
const getLogs = db.prepare(
  `SELECT * FROM requests WHERE key = ? ORDER BY created_at DESC LIMIT 10 OFFSET ?`
);
const getLogsBySha = db.prepare(
  `SELECT * FROM requests WHERE key = ? AND request_sha = ? ORDER BY created_at DESC LIMIT 10 OFFSET ?`
);

/**
 * @param {object} params
 * @param {object} searchParams
 * @returns object[]
 */
function requestLogs(params, searchParams) {
  const { key } = params;

  const { offset = 0, sha = '' } = searchParams;

  let rows;

  if (sha) {
    rows = getLogsBySha.all(key, sha, offset);
  } else {
    rows = getLogs.all(key, offset);
  }

  if (!rows) {
    return [];
  }

  return rows;
}

router.on('POST', '/api/:key', async (req, res, params) => {
  const { key } = params;
  const body = await getBody(req);

  const ip = req.connection.remoteAddress;
  create.run(key, body, ip, generateSHA(ip));

  console.log('created', key);

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(body);
});

router.on('GET', '/api/:key', (req, res, params) => {
  const { key } = params;
  const row = get.get(key);

  if (!row) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `No entry: ${key}` }));
    return;
  }

  const ip = req.connection.remoteAddress;

  log.run(key, ip, generateSHA(ip), JSON.stringify(req.headers));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(row.response);
});

router.on('GET', '/api/:key/logs', (req, res, params, store, searchParams) => {
  const { key } = params;
  let rows = requestLogs(params, searchParams);

  if (!rows.length) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `No entry (or logs): ${key}` }));
    return;
  }

  rows = rows.map((row) => ({
    created_at: row.created_at,
    request_sha: row.request_sha,
    metadata: JSON.parse(row.metadata),
  }));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(rows));
});

router.on(
  'GET',
  '/api/:key/logs.txt',
  (req, res, params, store, searchParams) => {
    let rows = requestLogs(params, searchParams);

    if (!rows.length) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end();
      return;
    }

    rows = rows.map((row) => `${row.created_at}\t${row.request_sha}`);

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(rows.join('\n'));
  }
);

const server = http.createServer((req, res) => router.lookup(req, res));

server.listen(3000, () =>
  console.log('Server running at http://localhost:3000')
);

async function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        // if (req.headers['content-type'].toLowerCase() === 'application/json') {
        //   return resolve(JSON.parse(body));
        // }

        return resolve(body);
      } catch (error) {
        return reject(error);
      }
    });
  });
}
