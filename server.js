/* =========================================================
   server.js — 정적 파일 서빙 + 랭킹 API

   부스 노트북 여러 대가 하나의 랭킹을 공유하기 위한 최소 서버.
   채점은 클라이언트를 믿지 않고 서버에서 다시 계산한다
   (js/util.js 를 그대로 가져다 쓰므로 계산이 어긋날 일이 없다).
   ========================================================= */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const U = require('./js/util.js');

const PORT     = process.env.PORT || 3000;
// 클라이언트 코드(js/ranking.js)에도 같은 기본값이 들어 있어 누구나 읽을 수 있다.
// 공개 주소로 운영한다면 Railway Variables 에 ADMIN_PW 를 따로 지정하는 편이 낫다.
const ADMIN_PW = process.env.ADMIN_PW || 'dubai123';
const ROOT     = __dirname;

/* =========================================================
   DB
   ========================================================= */
let pool = null;
let dbReady = false;

async function initDb(){
  if (!process.env.DATABASE_URL){
    console.log('[db] DATABASE_URL 이 없습니다. 랭킹은 각 브라우저 localStorage 로만 저장됩니다.');
    return;
  }

  const cfg = { connectionString: process.env.DATABASE_URL };
  // 공개 프록시 URL 로 붙는 경우엔 SSL 이 필요하다
  if (/proxy\.rlwy\.net|\.railway\.app/.test(process.env.DATABASE_URL)){
    cfg.ssl = { rejectUnauthorized: false };
  }

  pool = new Pool(cfg);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scores (
        id         BIGSERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        name_key   TEXT NOT NULL UNIQUE,
        score      NUMERIC(4,1)  NOT NULL,
        conc       NUMERIC(6,3)  NOT NULL,
        truth      NUMERIC(6,3)  NOT NULL,
        abs_err    NUMERIC(6,4)  NOT NULL,
        created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS scores_rank_idx
         ON scores (score DESC, abs_err ASC, created_at ASC)`
    );
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM scores');
    dbReady = true;
    console.log(`[db] 연결 성공. scores 테이블 준비 완료 (현재 ${rows[0].n}건)`);
  } catch (e){
    dbReady = false;
    console.error('[db] 연결 실패:', e.message);
    console.error('[db] 랭킹은 각 브라우저 localStorage 로만 저장됩니다.');
  }
}

function nameKey(s){
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function listRanking(){
  const { rows } = await pool.query(
    `SELECT id, name, score::float8 AS score, conc::float8 AS conc
       FROM scores
      ORDER BY score DESC, abs_err ASC, created_at ASC
      LIMIT 500`
  );
  return rows;
}

/* 이름이 겹치면 뒤에 번호를 붙여 다시 시도한다.
   메뉴에서 미리 검사하므로 실제로는 거의 걸리지 않는다. */
async function insertScore(name, conc, truth, absErr, score){
  for (let i = 0; i < 10; i++){
    const tryName = i === 0 ? name : `${name} (${i + 1})`;
    const { rows } = await pool.query(
      `INSERT INTO scores (name, name_key, score, conc, truth, abs_err)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name_key) DO NOTHING
       RETURNING id, name`,
      [tryName, nameKey(tryName), score, conc, truth, absErr]
    );
    if (rows.length) return rows[0];
  }
  throw new Error('이름이 너무 많이 겹칩니다');
}

/* =========================================================
   HTTP 유틸
   ========================================================= */
function sendJSON(res, code, obj){
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit = 8192){
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit){ reject(new Error('본문이 너무 큽니다')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e){ reject(new Error('JSON 파싱 실패')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon'
};

/* 공개해도 되는 것만 내보낸다.
   폴더 전체를 열어두면 server.js, package.json, .git 까지 읽힌다. */
const PUBLIC_DIRS  = ['css', 'js', 'fonts'];
const PUBLIC_FILES = ['index.html'];

function isPublic(rel){
  const parts = rel.replace(/^\/+/, '').split('/');
  if (parts.some(seg => seg === '' || seg === '.' || seg === '..')) return false;
  if (parts.length === 1) return PUBLIC_FILES.indexOf(parts[0]) >= 0;
  return PUBLIC_DIRS.indexOf(parts[0]) >= 0;
}

function serveStatic(req, res){
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]); }
  catch (e){ res.writeHead(400); res.end('400'); return; }

  if (rel === '/' || rel === '') rel = '/index.html';

  if (!isPublic(rel)){ res.writeHead(404); res.end('404'); return; }

  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT + path.sep)){ res.writeHead(403); res.end('403'); return; }

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()){ res.writeHead(404); res.end('404'); return; }

    const ext = path.extname(full).toLowerCase();
    // 폰트는 오래 캐시, 나머지는 매번 확인 (재배포가 바로 반영되도록)
    const cache = ext === '.woff2'
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';

    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache
    });
    fs.createReadStream(full).pipe(res);
  });
}

/* =========================================================
   라우팅
   ========================================================= */
async function handleApi(req, res, url){
  const p = url.pathname;

  if (p === '/api/health'){
    return sendJSON(res, 200, { ok: true, db: dbReady });
  }

  if (!dbReady){
    return sendJSON(res, 503, { ok: false, error: 'db_unavailable' });
  }

  if (p === '/api/ranking' && req.method === 'GET'){
    return sendJSON(res, 200, { ok: true, list: await listRanking() });
  }

  if (p === '/api/name' && req.method === 'GET'){
    const key = nameKey(url.searchParams.get('n'));
    if (!key) return sendJSON(res, 200, { ok: true, taken: false });
    const { rows } = await pool.query(
      'SELECT 1 FROM scores WHERE name_key = $1 LIMIT 1', [key]
    );
    return sendJSON(res, 200, { ok: true, taken: rows.length > 0 });
  }

  if (p === '/api/score' && req.method === 'POST'){
    const b = await readBody(req);

    const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!name) return sendJSON(res, 400, { ok: false, error: 'bad_name' });

    const conc  = Number(b.conc);
    const truth = Number(b.truth);
    if (!isFinite(conc) || !isFinite(truth)){
      return sendJSON(res, 400, { ok: false, error: 'bad_value' });
    }

    // 클라이언트가 보낸 점수는 쓰지 않는다. 여기서 다시 계산한다.
    const c = U.clamp(conc,  U.CONC_MIN, U.CONC_MAX);
    const t = U.clamp(truth, U.CONC_MIN, U.CONC_MAX);
    const absErr = Math.abs(U.absorbanceAt(c) - U.absorbanceAt(t));
    const score  = U.scoreFor(absErr);

    const row = await insertScore(name, c, t, absErr, score);
    return sendJSON(res, 200, {
      ok: true, id: row.id, name: row.name, score: score, absErr: absErr
    });
  }

  if (p === '/api/reset' && req.method === 'POST'){
    const b = await readBody(req);
    if (String(b.pw || '') !== ADMIN_PW){
      return sendJSON(res, 403, { ok: false, error: 'bad_password' });
    }
    await pool.query('TRUNCATE scores RESTART IDENTITY');
    console.log('[api] 랭킹 초기화됨');
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { ok: false, error: 'not_found' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')){
    handleApi(req, res, url).catch(e => {
      console.error('[api]', url.pathname, e.message);
      sendJSON(res, 500, { ok: false, error: 'server_error' });
    });
    return;
  }

  serveStatic(req, res);
});

initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`[http] 포트 ${PORT} 에서 서비스 시작`);
  });
});
