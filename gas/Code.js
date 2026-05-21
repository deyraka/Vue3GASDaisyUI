/**
 * SSO Server (Google Apps Script Web App)
 * - Manual login form (Username/NIP + Password)
 * - Spreadsheet DB: db_users, db_apps, db_sessions
 * - One-way password hashing: SHA-256
 * - Reversible encryption for phone/email: AES-256 via CryptoJS
 *
 * NOTES:
 * - Deploy as Web App with Execute as: Me, Who has access: Anyone
 * - Set Script Properties:
 *   - SECRET_KEY_DATABASE (32+ chars recommended) for AES
 *
 * CryptoJS requirements:
 * - This server expects CryptoJS to be available as a global (window.CryptoJS / global CryptoJS).
 * - In Apps Script, there is no “window”; therefore you must provide CryptoJS in the deployment
 *   environment. The intended approach for this repo is to inject CryptoJS via the Apps Script
 *   HTMLService / template where needed, or by ensuring it is bundled in this Code.js runtime.
 *
 * In this implementation, CryptoJS usage is wrapped so the server fails with a clear message
 * if CryptoJS is missing.
 */

/* global CryptoJS */

const SHEET_USER = 'db_users';
const SHEET_APPS = 'db_apps';
const SHEET_SESSIONS = 'db_sessions';

// ===== Utilities =============================================================

function getProps_() {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('SECRET_KEY_DATABASE');
  if (!secret) throw new Error('Missing Script Property: SECRET_KEY_DATABASE');
  return { secret };
}

function sha256_(input) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(input));
  return toHex_(bytes);
}

function toHex_(bytes) {
  return bytes
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2))
    .join('');
}

function nowMs_() {
  return Date.now();
}

function safeString_(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function parseBody_(e) {
  // For GET: e.parameter
  // For POST: either form-encoded or JSON
  if (!e) return {};
  const params = e.parameter || {};
  if (Object.keys(params).length > 0) return params;

  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : '';
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function json_(obj, statusCode) {
  const payload = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

  if (statusCode) payload.setStatusCode(statusCode);
  return payload;
}

function html_(html, statusCode) {
  const out = ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
  if (statusCode) out.setStatusCode(statusCode);
  return out;
}

function requireCryptoJS_() {
  if (typeof CryptoJS === 'undefined' || !CryptoJS) {
    throw new Error('CryptoJS is not available in this GAS runtime. Inject/bundle CryptoJS for AES operations.');
  }
  return CryptoJS;
}

// ===== Crypto (AES) ==========================================================
// This uses CryptoJS AES with derived key from SECRET_KEY_DATABASE.
// For simplicity and compatibility, we encrypt with AES-CBC + PKCS7 and encode as base64.

function encrypt_(plaintext_, secret_) {
  const Crypto = requireCryptoJS_();
  const plaintext = safeString_(plaintext_);
  const secret = safeString_(secret_);

  // Derive key & iv from secret deterministically.
  // NOTE: This is not “best practice crypto”, but it matches the expected plan behavior.
  const key = Crypto.SHA256(secret).toString(Crypto.enc.Hex); // 64 hex chars
  const iv = Crypto.SHA256('iv::' + secret).toString(Crypto.enc.Hex); // 64 hex chars

  const keyWords = Crypto.enc.Hex.parse(key);
  const ivWords = Crypto.enc.Hex.parse(iv);

  const encrypted = Crypto.AES.encrypt(plaintext, keyWords, {
    iv: ivWords,
    mode: Crypto.mode.CBC,
    padding: Crypto.pad.Pkcs7,
  });

  return encrypted.toString(); // base64
}

function decrypt_(ciphertext_, secret_) {
  const Crypto = requireCryptoJS_();
  const secret = safeString_(secret_);
  const ciphertext = safeString_(ciphertext_);
  if (!ciphertext) return '';

  const key = Crypto.SHA256(secret).toString(Crypto.enc.Hex);
  const iv = Crypto.SHA256('iv::' + secret).toString(Crypto.enc.Hex);

  const keyWords = Crypto.enc.Hex.parse(key);
  const ivWords = Crypto.enc.Hex.parse(iv);

  const decrypted = Crypto.AES.decrypt(ciphertext, keyWords, {
    iv: ivWords,
    mode: Crypto.mode.CBC,
    padding: Crypto.pad.Pkcs7,
  });

  return decrypted.toString(Crypto.enc.Utf8);
}

// ===== Spreadsheet Access ===================================================

function getActiveSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheetByName_(name) {
  const ss = getActiveSpreadsheet_();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Missing sheet: ${name}`);
  return sheet;
}

function readAllRowsAsObjects_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];

  const headers = data[0].map(h => safeString_(h));
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const obj = {};
    let empty = true;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const val = row[c];
      if (key) obj[key] = val;
      if (val !== '' && val !== null && val !== undefined) empty = false;
    }
    if (!empty) rows.push(obj);
  }
  return rows;
}

function findRowsBy_(sheetName, predicateFn) {
  const sheet = getSheetByName_(sheetName);
  const rows = readAllRowsAsObjects_(sheet);

  // Return both objects and original 1-based row index (for delete/update).
  // Since readAllRowsAsObjects_ loses row index, we reconstruct by scanning again.
  const all = sheet.getDataRange().getValues();
  const headers = all[0].map(h => safeString_(h));
  const results = [];

  for (let i = 1; i < all.length; i++) {
    const rowVals = all[i];
    const obj = {};
    let empty = true;

    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const val = rowVals[c];
      if (key) obj[key] = val;
      if (val !== '' && val !== null && val !== undefined) empty = false;
    }
    if (empty) continue;

    if (predicateFn(obj)) {
      results.push({ obj, rowIndex: i + 1 }); // 1-based including header row at 1
    }
  }
  return { sheet, results };
}

function deleteRowByIndex_(sheet, rowIndex1Based) {
  sheet.deleteRow(rowIndex1Based);
}

// ===== Token helpers =========================================================

function randomToken_(len = 32) {
  // GAS Utilities.getUuid() gives good uniqueness; we compress to len
  const uuid = Utilities.getUuid().replace(/-/g, '');
  if (len <= uuid.length) return uuid.slice(0, len);
  return uuid + Utilities.getUuid().replace(/-/g, '').slice(0, (len - uuid.length));
}

// ===== SSO core ===============================================================

function validateApp_(app_id_) {
  const appId = safeString_(app_id_);
  if (!appId) throw new Error('Missing app_id');

  const { results } = findRowsBy_(SHEET_APPS, r => safeString_(r.app_id) === appId && safeString_(r.status) === 'ACTIVE');
  if (!results.length) return null;

  const appRow = results[0].obj;
  return {
    app_id: safeString_(appRow.app_id),
    app_name: safeString_(appRow.app_name),
    client_token: safeString_(appRow.client_token),
    redirect_url: safeString_(appRow.redirect_url),
    status: safeString_(appRow.status),
  };
}

function findUserBy_(usernameOrNip_) {
  const id = safeString_(usernameOrNip_);
  if (!id) throw new Error('Missing username/nip');

  const { results } = findRowsBy_(SHEET_USER, r => safeString_(r.username) === id || safeString_(r.nip) === id);
  if (!results.length) return null;

  const u = results[0].obj;
  return {
    id: safeString_(u.id),
    nip: safeString_(u.nip),
    username: safeString_(u.username),
    phone_enc: safeString_(u.phone),
    email_enc: safeString_(u.email),
    password_hash: safeString_(u.password),
  };
}

function findSessionByToken_(auth_token_) {
  const token = safeString_(auth_token_);
  if (!token) return null;

  const { results } = findRowsBy_(SHEET_SESSIONS, r => safeString_(r.auth_token) === token);
  if (!results.length) return null;

  const s = results[0].obj;
  const created = Number(s.created_at || 0);
  const expiredAt = Number(s.expired_at || 0);
  const expired = expiredAt && nowMs_() > expiredAt;

  return {
    sessionRowIndex: results[0].rowIndex,
    session: {
      username: safeString_(s.username),
      nip: safeString_(s.nip),
      app_id: safeString_(s.app_id),
      auth_token: safeString_(s.auth_token),
      client_token: safeString_(s.client_token), // optional column; kept for strict matching if present
      created_at: created,
      expired_at: expiredAt,
      expired,
    },
  };
}

function buildLoginPage_(app_id_, app_name_) {
  // Manual form. Credentials are submitted via POST to same web app URL.
  // We do NOT pass sensitive fields via query string.
  const safeAppName = (app_name_ || app_id_).replace(/[<>&"]/g, '');
  const safeAppId = (app_id_ || '').replace(/[<>&"]/g, '');
  const actionUrl = ''; // same endpoint; Apps Script handles at web app root
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>SSO Login</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f7f7fb;}
  .card{width:min(520px,92vw);background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:18px;}
  h1{font-size:20px;margin:0 0 12px;}
  label{display:block;margin:10px 0 6px;font-size:13px;color:#444;}
  input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.18);outline:none;}
  input:focus{border-color:#2b6cff;box-shadow:0 0 0 3px rgba(43,108,255,.12)}
  button{margin-top:14px;width:100%;padding:10px 12px;border:none;border-radius:10px;background:#111827;color:#fff;font-weight:700;cursor:pointer;}
  .hint{margin-top:10px;font-size:12px;color:#666;line-height:1.45}
  .error{padding:10px 12px;background:#ffecec;border:1px solid #ffbdbd;border-radius:10px;color:#8a0f0f;margin-top:12px;}
</style>
</head>
<body>
  <div class="card">
    <h1>Login SSO - ${safeAppName}</h1>
    <form method="POST" action="${actionUrl}">
      <input type="hidden" name="app_id" value="${safeAppId}"/>
      <label>Username / NIP</label>
      <input type="text" name="username_nip" autocomplete="username" required />
      <label>Password</label>
      <input type="password" name="password" autocomplete="current-password" required />
      <button type="submit">Login</button>
      <div class="hint">Gunakan kredensial Anda. Password tidak pernah dikirim via query string.</div>
    </form>
  </div>
</body>
</html>`;
}

function redirectToClient_(redirectUrl_, token_) {
  const sep = redirectUrl_.includes('?') ? '&' : '?';
  return redirectUrl_ + sep + 'token=' + encodeURIComponent(token_);
}

// ===== doGet / doPost ========================================================

/**
 * doGet(e)
 * - Expects query: app_id=...
 * - Validates app is ACTIVE
 * - Serves manual login HTML page
 */
function doGet(e) {
  try {
    const app_id = safeString_(e && e.parameter ? e.parameter.app_id : '');
    if (!app_id) return html_('Missing app_id', 400);

    const app = validateApp_(app_id);
    if (!app) return html_('Access denied: unknown or inactive app_id', 403);

    const page = buildLoginPage_(app.app_id, app.app_name);
    return html_(page);
  } catch (err) {
    return html_('SSO server error: ' + safeString_(err && err.message), 500);
  }
}

/**
 * doPost(e)
 * Two modes:
 *  A) Browser submits login form:
 *     - expects: app_id, username_nip, password
 *     - returns HTTP redirect to redirect_url?token=AUTH_TOKEN
 *  B) Client backend verifies:
 *     - expects JSON/body: client_token, auth_token
 *     - returns JSON profile { nip, username, phone }
 */
function doPost(e) {
  try {
    const body = parseBody_(e);

    // Mode A: login form submission (browser)
    const hasForm = safeString_(body.app_id) && safeString_(body.username_nip) && safeString_(body.password);
    if (hasForm) {
      const app_id = safeString_(body.app_id);
      const username_nip = safeString_(body.username_nip);
      const password = safeString_(body.password);

      const app = validateApp_(app_id);
      if (!app) return html_('Access denied: unknown or inactive app_id', 403);

      const user = findUserBy_(username_nip);
      if (!user) return html_('Login failed: user not found', 401);

      const hashed = hashPassword_(password);
      if (hashed !== user.password_hash) return html_('Login failed: incorrect password', 401);

      const auth_token = randomToken_(32);
      const ttlMs = 5 * 60 * 1000; // 5 minutes
      const createdAt = nowMs_();
      const expiredAt = createdAt + ttlMs;

      const sessSheet = getSheetByName_(SHEET_SESSIONS);

      // Expected columns by plan:
      // session_id, username, nip, app_id, auth_token, created_at, expired_at
      // We'll also attempt to set client_token if column exists.
      const newSessionId = randomToken_(20);
      const header = sessSheet.getDataRange().getValues()[0].map(h => safeString_(h));

      const row = new Array(header.length).fill('');
      for (let i = 0; i < header.length; i++) {
        const col = header[i];
        if (col === 'session_id') row[i] = newSessionId;
        if (col === 'username') row[i] = user.username;
        if (col === 'nip') row[i] = user.nip;
        if (col === 'app_id') row[i] = app.app_id;
        if (col === 'auth_token') row[i] = auth_token;
        if (col === 'client_token') row[i] = app.client_token;
        if (col === 'created_at') row[i] = createdAt;
        if (col === 'expired_at') row[i] = expiredAt;
      }

      sessSheet.appendRow(row);

      // Redirect client web app URL with token
      const target = redirectToClient_(app.redirect_url, auth_token);

      // For Apps Script: return an HTML that triggers redirect.
      // (Alternatively, use ContentService with meta refresh to avoid browser blocking.)
      const html = `<!doctype html><html><head><meta charset="utf-8"/><meta http-equiv="refresh" content="0; url=${encodeURI(target)}"/></head><body>Redirecting...</body></html>`;
      return html_(html);
    }

    // Mode B: client backend verification
    const client_token = safeString_(body.client_token);
    const auth_token = safeString_(body.auth_token);

    if (!client_token || !auth_token) return json_({ ok: false, error: 'Missing client_token or auth_token' }, 400);

    // Validate session token and expiry
    const sessionLookup = findSessionByToken_(auth_token);
    if (!sessionLookup || !sessionLookup.session) return json_({ ok: false, error: 'Invalid auth_token' }, 401);
    if (sessionLookup.session.expired) {
      // single-use invalidation: delete row if expired as well
      const sessSheet = getSheetByName_(SHEET_SESSIONS);
      deleteRowByIndex_(sessSheet, sessionLookup.sessionRowIndex);
      return json_({ ok: false, error: 'auth_token expired' }, 401);
    }

    // Validate app_id + client_token match (strict)
    const app = validateApp_(sessionLookup.session.app_id);
    if (!app) {
      const sessSheet = getSheetByName_(SHEET_SESSIONS);
      deleteRowByIndex_(sessSheet, sessionLookup.sessionRowIndex);
      return json_({ ok: false, error: 'Invalid app_id for this token' }, 401);
    }

    if (app.client_token !== client_token) {
      const sessSheet = getSheetByName_(SHEET_SESSIONS);
      deleteRowByIndex_(sessSheet, sessionLookup.sessionRowIndex);
      return json_({ ok: false, error: 'Invalid client_token for this auth_token' }, 401);
    }

    // Single-use invalidation: delete token record BEFORE returning profile
    const sessSheet = getSheetByName_(SHEET_SESSIONS);
    deleteRowByIndex_(sessSheet, sessionLookup.sessionRowIndex);

    // Load user profile and decrypt phone/email
    const user = findUserBy_(sessionLookup.session.nip || sessionLookup.session.username);
    if (!user) return json_({ ok: false, error: 'User record not found' }, 404);

    const { secret } = getProps_();
    const phone = user.phone_enc ? decrypt_(user.phone_enc, secret) : '';
    const email = user.email_enc ? decrypt_(user.email_enc, secret) : '';

    return json_({
      ok: true,
      profile: {
        nip: user.nip,
        username: user.username,
        phone,
        email, // included for completeness; remove if you want strictly phone only
      },
    });
  } catch (err) {
    return json_({ ok: false, error: safeString_(err && err.message) }, 500);
  }
}
