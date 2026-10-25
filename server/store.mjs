import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function createStore(directory) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  const secretPath = join(root, 'secret.key');
  let secret;
  try {
    secret = readFileSync(secretPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    secret = randomBytes(32);
    writeFileSync(secretPath, secret, { flag: 'wx', mode: 0o600 });
  }
  if (secret.length !== 32) throw new Error('Invalid local secret key');
  const mediaRoot = join(root, 'media');
  mkdirSync(mediaRoot, { recursive: true });
  const db = new DatabaseSync(join(root, 'studio.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, access_token TEXT NOT NULL,
      refresh_token TEXT, access_expires INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      validated_at INTEGER NOT NULL, user_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      user_id INTEGER NOT NULL, group_id INTEGER NOT NULL, key_id INTEGER,
      encrypted_key TEXT NOT NULL, PRIMARY KEY (user_id, group_id)
    );
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS threads_user_idx ON threads(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS thread_renames (
      thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
      renamed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL, client_request_id TEXT NOT NULL, prompt TEXT NOT NULL,
      model TEXT NOT NULL, size TEXT NOT NULL, count INTEGER NOT NULL,
      group_id INTEGER NOT NULL, status TEXT NOT NULL, error TEXT,
      reference_ids TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      UNIQUE(user_id, client_request_id)
    );
    CREATE TABLE IF NOT EXISTS style_revocations (
      user_id INTEGER NOT NULL, selection_id TEXT NOT NULL, revoked_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, selection_id)
    );
    CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(thread_id, created_at);
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL, kind TEXT NOT NULL, mime TEXT NOT NULL,
      filename TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS media_message_idx ON media(message_id);
  `);
  if (!db.prepare('PRAGMA table_info(messages)').all().some(column => column.name === 'aspect_ratio')) {
    db.exec("ALTER TABLE messages ADD COLUMN aspect_ratio TEXT NOT NULL DEFAULT 'auto'");
  }
  if (!db.prepare('PRAGMA table_info(messages)').all().some(column => column.name === 'context_json')) {
    db.exec(`ALTER TABLE messages ADD COLUMN context_json TEXT NOT NULL DEFAULT '{"enabled":false}'`);
  }
  const messageColumns = new Set(db.prepare('PRAGMA table_info(messages)').all().map(column => column.name));
  for (const [name, declaration] of Object.entries({
    kind: "TEXT NOT NULL DEFAULT 'image'", assistant_text: "TEXT NOT NULL DEFAULT ''",
    proposal_json: 'TEXT', plan_state: "TEXT NOT NULL DEFAULT ''", confirmed_job_id: 'TEXT'
  })) if (!messageColumns.has(name)) db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${declaration}`);
  db.prepare("UPDATE messages SET status='unknown', error='服务重启，结果待核对。请联系管理员微信 panrui12。' WHERE status='running' OR status='queued'").run();

  function encrypt(value) {
    if (!value) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', secret, iv);
    const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), bytes].map((part) => part.toString('base64url')).join('.');
  }
  function decrypt(value) {
    if (!value) return null;
    const [iv, tag, data] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', secret, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
  function sessionHash(token) { return createHash('sha256').update(token).digest('hex'); }
  function saveSession(user, accessToken, refreshToken, expiresIn) {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    db.prepare(`INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sessionHash(token), user.id, encrypt(accessToken), encrypt(refreshToken),
        now + Math.max(60, Number(expiresIn) || 900) * 1000, now + WEEK_MS, now, JSON.stringify(user));
    return token;
  }
  function session(token) {
    if (!token) return null;
    const row = db.prepare('SELECT * FROM sessions WHERE id_hash=? AND expires_at>?').get(sessionHash(token), Date.now());
    return row && {
      ...row, user: JSON.parse(row.user_json),
      accessToken: decrypt(row.access_token), refreshToken: decrypt(row.refresh_token)
    };
  }
  function sessionByHash(hash) {
    const row = db.prepare('SELECT * FROM sessions WHERE id_hash=? AND expires_at>?').get(hash, Date.now());
    return row && {
      ...row, user: JSON.parse(row.user_json),
      accessToken: decrypt(row.access_token), refreshToken: decrypt(row.refresh_token)
    };
  }
  function updateSession(row, patch) {
    const user = patch.user || row.user;
    db.prepare(`UPDATE sessions SET access_token=?, refresh_token=?, access_expires=?, validated_at=?, user_json=? WHERE id_hash=?`)
      .run(encrypt(patch.accessToken || row.accessToken), encrypt(patch.refreshToken || row.refreshToken),
        patch.accessExpires || row.access_expires, Date.now(), JSON.stringify(user), row.id_hash);
    Object.assign(row, patch, { user, access_expires: patch.accessExpires || row.access_expires, validated_at: Date.now() });
  }
  function addMedia(userId, messageId, kind, mime, bytes) {
    const id = randomUUID();
    const filename = `${id}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`;
    writeFileSync(join(mediaRoot, filename), bytes, { flag: 'wx', mode: 0o600 });
    const now = Date.now();
    db.prepare('INSERT INTO media VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, messageId, userId, kind, mime, filename, now, now + WEEK_MS);
    return id;
  }
  function media(id, userId) {
    const row = db.prepare('SELECT * FROM media WHERE id=? AND user_id=? AND expires_at>?').get(id, userId, Date.now());
    return row && { ...row, bytes: readFileSync(join(mediaRoot, row.filename)) };
  }
  function removeMediaForMessage(messageId) {
    for (const row of db.prepare('SELECT filename FROM media WHERE message_id=?').all(messageId)) {
      rmSync(join(mediaRoot, row.filename), { force: true });
    }
  }
  function cleanup(now = Date.now()) {
    db.prepare('DELETE FROM style_revocations WHERE revoked_at<?').run(now - WEEK_MS);
    for (const row of db.prepare('SELECT id FROM messages WHERE expires_at<=?').all(now)) removeMediaForMessage(row.id);
    db.prepare('DELETE FROM messages WHERE expires_at<=?').run(now);
    db.prepare('DELETE FROM threads WHERE NOT EXISTS (SELECT 1 FROM messages WHERE thread_id=threads.id) AND created_at<=?').run(now - WEEK_MS);
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
    const known = new Set(db.prepare('SELECT filename FROM media').all().map((row) => row.filename));
    for (const filename of readdirSync(mediaRoot)) {
      if (!known.has(filename)) rmSync(join(mediaRoot, filename), { force: true });
    }
  }
  function result(message) {
    if (!message) return null;
    const mediaRows = db.prepare('SELECT id,kind,mime FROM media WHERE message_id=? ORDER BY created_at,id').all(message.id);
    const context = JSON.parse(message.context_json || '{"enabled":false}');
    if (context.styleOptimization) {
      const { mode, version, model, demo, style, styleInput, styleSelectionId, profile } = context.styleOptimization;
      context.styleOptimization = { mode, version, model, demo, style, styleInput, styleSelectionId, profile: { id: profile.id, name: profile.name, focus: profile.focus } };
    }
    return {
      id: message.id, threadId: message.thread_id, prompt: message.prompt, model: message.model,
      size: message.size, count: message.count, groupId: message.group_id, status: message.status,
      aspectRatio: message.aspect_ratio || 'auto',
      kind: message.kind || 'image', assistantText: message.assistant_text || '',
      proposal: message.proposal_json ? { ...JSON.parse(message.proposal_json), state: message.plan_state, jobId: message.confirmed_job_id } : null,
      context,
      error: message.error, referenceIds: JSON.parse(message.reference_ids),
      images: mediaRows.filter((item) => item.kind === 'output').map((item) => ({ id: item.id, mime: item.mime, url: `/api/media/${item.id}` })),
      createdAt: message.created_at, updatedAt: message.updated_at
    };
  }
  return {
    root, db, encrypt, decrypt, sessionHash, saveSession, session, sessionByHash, updateSession, media, addMedia, cleanup, result,
    getKey(userId, groupId) {
      const row = db.prepare('SELECT * FROM api_keys WHERE user_id=? AND group_id=?').get(userId, groupId);
      return row && { key: decrypt(row.encrypted_key), keyId: row.key_id };
    },
    putKey(userId, groupId, key, keyId) {
      db.prepare(`INSERT INTO api_keys VALUES (?, ?, ?, ?) ON CONFLICT(user_id,group_id)
        DO UPDATE SET key_id=excluded.key_id, encrypted_key=excluded.encrypted_key`)
        .run(userId, groupId, keyId || null, encrypt(key));
    },
    createThread(userId) {
      const id = randomUUID(), now = Date.now();
      db.prepare('INSERT INTO threads VALUES (?, ?, ?, ?, ?)').run(id, userId, '新的创作', now, now);
      return { id, title: '新的创作', createdAt: now, updatedAt: now };
    },
    threads(userId) {
      return db.prepare('SELECT id,title,created_at AS createdAt,updated_at AS updatedAt,EXISTS(SELECT 1 FROM thread_renames r WHERE r.thread_id=threads.id) AS titleEdited FROM threads WHERE user_id=? ORDER BY updated_at DESC').all(userId);
    },
    thread(id, userId) { return db.prepare('SELECT * FROM threads WHERE id=? AND user_id=?').get(id, userId); },
    renameThread(id, userId, title) {
      const now = Date.now();
      const row = db.prepare('UPDATE threads SET title=?,updated_at=? WHERE id=? AND user_id=? RETURNING id,title,created_at AS createdAt,updated_at AS updatedAt').get(title, now, id, userId);
      if (!row) return null;
      db.prepare('INSERT INTO thread_renames(thread_id,renamed_at) VALUES (?,?) ON CONFLICT(thread_id) DO UPDATE SET renamed_at=excluded.renamed_at').run(id, now);
      return { ...row, titleEdited: true };
    },
    messages(threadId, userId) {
      return db.prepare('SELECT * FROM messages WHERE thread_id=? AND user_id=? AND expires_at>? ORDER BY rowid').all(threadId, userId, Date.now()).map(result);
    },
    getMessage(id, userId) { return result(db.prepare('SELECT * FROM messages WHERE id=? AND user_id=?').get(id, userId)); },
    contextJob(id) {
      const row = db.prepare('SELECT * FROM messages WHERE id=? AND expires_at>?').get(id, Date.now());
      return row && { ...result(row), context: JSON.parse(row.context_json || '{"enabled":false}'), userId: row.user_id };
    },
    contextParent(id, userId, parentId) {
      const current = db.prepare('SELECT rowid AS sequence,thread_id FROM messages WHERE id=? AND user_id=? AND expires_at>?').get(id, userId, Date.now());
      if (!current) return null;
      return result(db.prepare(`SELECT m.* FROM messages m WHERE m.user_id=? AND m.thread_id=? AND m.rowid<? AND m.expires_at>?
        AND m.status IN ('done','partial') AND EXISTS (SELECT 1 FROM media a WHERE a.message_id=m.id AND a.user_id=? AND a.kind='output' AND a.expires_at>?)
        ${parentId ? 'AND m.id=?' : ''} ORDER BY m.rowid DESC LIMIT 1`)
        .get(userId, current.thread_id, current.sequence, Date.now(), userId, Date.now(), ...(parentId ? [parentId] : [])));
    },
    isStyleRevoked(userId, selectionId) {
      return Boolean(selectionId && db.prepare('SELECT 1 FROM style_revocations WHERE user_id=? AND selection_id=?').get(userId, selectionId));
    },
    styleRevocationCutoff(threadId, userId) {
      return db.prepare(`SELECT MAX(r.revoked_at) AS cutoff FROM style_revocations r JOIN messages m
        ON m.user_id=r.user_id AND (json_extract(m.proposal_json,'$.styleSelectionId')=r.selection_id
          OR json_extract(m.context_json,'$.styleOptimization.styleSelectionId')=r.selection_id
          OR (m.id=r.selection_id AND json_extract(m.proposal_json,'$.style') IS NOT NULL))
        WHERE m.thread_id=? AND m.user_id=?`).get(threadId, userId)?.cutoff || 0;
    },
    revokeStyle(userId, selectionId) {
      const now = Date.now();
      db.prepare('INSERT INTO style_revocations VALUES (?,?,?) ON CONFLICT(user_id,selection_id) DO NOTHING').run(userId, selectionId, now);
      const related = db.prepare(`SELECT DISTINCT thread_id FROM messages WHERE user_id=? AND
        (json_extract(proposal_json,'$.styleSelectionId')=? OR json_extract(context_json,'$.styleOptimization.styleSelectionId')=? OR (id=? AND json_extract(proposal_json,'$.style') IS NOT NULL))`).all(userId, selectionId, selectionId, selectionId);
      for (const row of related) {
        // Every pending plan in this branch may have inherited the withdrawn recipe.
        db.prepare("UPDATE messages SET plan_state='revoked',updated_at=? WHERE thread_id=? AND user_id=? AND plan_state='ready'").run(now, row.thread_id, userId);
      }
      return { revoked: true, selectionId, threadIds: related.map(row => row.thread_id) };
    },
    setContext(id, context) { db.prepare('UPDATE messages SET context_json=? WHERE id=?').run(JSON.stringify(context), id); },
    priorMessages(id, userId, limit = 30) {
      const row = db.prepare('SELECT rowid AS sequence,thread_id FROM messages WHERE id=? AND user_id=?').get(id, userId);
      if (!row) return [];
      return db.prepare(`SELECT * FROM messages WHERE thread_id=? AND user_id=? AND rowid<? AND expires_at>?
        AND status IN ('done','partial') ORDER BY rowid DESC LIMIT ?`).all(row.thread_id, userId, row.sequence, Date.now(), limit).reverse().map(result);
    },
    supersedePlans(threadId, userId) {
      db.prepare("UPDATE messages SET plan_state='superseded' WHERE thread_id=? AND user_id=? AND kind='chat' AND plan_state='ready'").run(threadId, userId);
    },
    finishChat(id, assistantText, proposal) {
      const current = db.prepare('SELECT rowid AS sequence,thread_id,user_id FROM messages WHERE id=?').get(id);
      const newer = db.prepare("SELECT 1 FROM messages WHERE thread_id=? AND user_id=? AND rowid>? AND kind='chat' LIMIT 1").get(current.thread_id, current.user_id, current.sequence);
      db.prepare("UPDATE messages SET status='done',assistant_text=?,proposal_json=?,plan_state=?,updated_at=? WHERE id=?")
        .run(assistantText, proposal ? JSON.stringify(proposal) : null, proposal ? (newer ? 'superseded' : 'ready') : '', Date.now(), id);
    },
    markConfirmed(id, jobId, prompt) {
      db.prepare("UPDATE messages SET plan_state='confirmed',confirmed_job_id=?,proposal_json=json_set(proposal_json,'$.prompt',?),updated_at=? WHERE id=?").run(jobId, prompt, Date.now(), id);
    },
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const value = fn(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    findRequest(userId, clientRequestId) { return result(db.prepare('SELECT * FROM messages WHERE user_id=? AND client_request_id=?').get(userId, clientRequestId)); },
    createMessage(userId, threadId, input) {
      const id = randomUUID(), now = Date.now();
      db.prepare(`INSERT INTO messages (id,thread_id,user_id,client_request_id,prompt,model,size,count,group_id,status,created_at,updated_at,expires_at,aspect_ratio,context_json,kind)
        VALUES (?,?,?,?,?,?,?,?,?,'queued',?,?,?,?,?,?)`)
        .run(id, threadId, userId, input.clientRequestId, input.prompt, input.model, input.size, input.count, input.groupId, now, now, now + WEEK_MS, input.aspectRatio || 'auto', JSON.stringify(input.context || { enabled: false }), input.kind || 'image');
      db.prepare("UPDATE threads SET title=CASE WHEN title='新的创作' AND NOT EXISTS(SELECT 1 FROM thread_renames r WHERE r.thread_id=threads.id) THEN ? ELSE title END,updated_at=? WHERE id=?")
        .run(input.prompt.slice(0, 24), now, threadId);
      return result(db.prepare('SELECT * FROM messages WHERE id=?').get(id));
    },
    setReferences(id, ids) { db.prepare('UPDATE messages SET reference_ids=?,updated_at=? WHERE id=?').run(JSON.stringify(ids), Date.now(), id); },
    updateMessage(id, status, error = null) { db.prepare('UPDATE messages SET status=?,error=?,updated_at=? WHERE id=?').run(status, error, Date.now(), id); },
    pendingCount(userId) { return db.prepare("SELECT count(*) AS n FROM messages WHERE user_id=? AND status IN ('queued','running')").get(userId).n; },
    deleteThread(id, userId) {
      if (!db.prepare('SELECT id FROM threads WHERE id=? AND user_id=?').get(id, userId)) return false;
      for (const row of db.prepare('SELECT id FROM messages WHERE thread_id=?').all(id)) removeMediaForMessage(row.id);
      db.prepare('DELETE FROM threads WHERE id=? AND user_id=?').run(id, userId);
      return true;
    },
    close() { db.close(); }
  };
}
