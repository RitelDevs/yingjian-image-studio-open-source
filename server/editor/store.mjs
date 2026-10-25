import { randomUUID } from 'node:crypto';

const WEEK_MS = 7 * 24 * 60 * 60_000;
const restartMessage = '服务已重启，这次编辑对话结果待核对，未自动重新请求。画面尚未由本次请求修改；请勿立即重复提交。';

export function createEditorStore(store) {
  const db = store.db;
  db.exec(    'CREATE TABLE IF NOT EXISTS editor_requests (' +
    'id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, client_request_id TEXT NOT NULL,' +
    'document_id TEXT NOT NULL, base_revision INTEGER NOT NULL, group_id INTEGER NOT NULL, model TEXT NOT NULL,' +
    'prompt TEXT NOT NULL, input_hash TEXT NOT NULL, state_json TEXT NOT NULL, preview_data_url TEXT,' +
    "status TEXT NOT NULL, reply TEXT NOT NULL DEFAULT '', operations_json TEXT NOT NULL DEFAULT '[]'," +
    'error TEXT, reason TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,' +
    'UNIQUE(user_id,client_request_id));' +
    'CREATE INDEX IF NOT EXISTS editor_document_idx ON editor_requests(user_id,document_id,created_at);' +
    'CREATE INDEX IF NOT EXISTS editor_expiry_idx ON editor_requests(expires_at);'
  );
  db.prepare("UPDATE editor_requests SET status='unknown',error=?,reason='editor_restart',preview_data_url=NULL,updated_at=? WHERE status IN ('queued','running')")
    .run(restartMessage, Date.now());

  function publicResult(row) {
    if (!row) return null;
    return {
      requestId: row.id, clientRequestId: row.client_request_id, documentId: row.document_id,
      baseRevision: row.base_revision, status: row.status, reply: row.reply,
      operations: JSON.parse(row.operations_json), error: row.error, reason: row.reason,
      createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at
    };
  }
  function byId(userId, id) {
    return db.prepare('SELECT * FROM editor_requests WHERE id=? AND user_id=? AND expires_at>?').get(id, userId, Date.now());
  }
  return {
    publicResult, byId,
    findRequest(userId, clientRequestId) {
      return db.prepare('SELECT * FROM editor_requests WHERE user_id=? AND client_request_id=?').get(userId, clientRequestId);
    },
    create(userId, input, model) {
      const now = Date.now(), id = randomUUID();
      db.prepare("INSERT INTO editor_requests (id,user_id,client_request_id,document_id,base_revision,group_id,model,prompt,input_hash,state_json,preview_data_url,status,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'queued',?,?,?)")
        .run(id, userId, input.clientRequestId, input.documentId, input.baseRevision, input.groupId, model,
          input.message, input.inputHash, JSON.stringify(input.state), input.previewDataUrl, now, now, now + WEEK_MS);
      return byId(userId, id);
    },
    markRunning(userId, id) {
      return db.prepare("UPDATE editor_requests SET status='running',updated_at=? WHERE id=? AND user_id=? AND status='queued'")
        .run(Date.now(), id, userId).changes === 1;
    },
    finish(userId, id, { status, reply = '', operations = [], error = null, reason = null }) {
      db.prepare("UPDATE editor_requests SET status=?,reply=?,operations_json=?,error=?,reason=?,preview_data_url=NULL,updated_at=? WHERE id=? AND user_id=? AND status='running'")
        .run(status, reply, JSON.stringify(operations), error, reason, Date.now(), id, userId);
    },
    history(userId, documentId, beforeId) {
      return db.prepare("SELECT prompt,reply,operations_json FROM editor_requests WHERE user_id=? AND document_id=? AND status='done' AND expires_at>? AND rowid<(SELECT rowid FROM editor_requests WHERE id=? AND user_id=?) ORDER BY rowid DESC LIMIT 12")
        .all(userId, documentId, Date.now(), beforeId, userId).reverse();
    },
    pendingCount(userId) {
      return db.prepare("SELECT count(*) AS n FROM editor_requests WHERE user_id=? AND status IN ('queued','running')").get(userId).n;
    },
    cleanup(now = Date.now()) { db.prepare('DELETE FROM editor_requests WHERE expires_at<=?').run(now); },
    close() {
      db.prepare("UPDATE editor_requests SET status='unknown',error=?,reason='editor_restart',preview_data_url=NULL,updated_at=? WHERE status IN ('queued','running')")
        .run(restartMessage, Date.now());
    }
  };
}
