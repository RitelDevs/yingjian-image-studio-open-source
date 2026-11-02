# Real Studio backend: Sub2API central account mode

Optional central-account integration. The existing legacy gateway and Keycloak
unifiedAccount modes remain available. Select exactly one mode.

## Assembly and private configuration

- Programmatic: createApplication({ sub2apiAccount: createSub2apiAccount({ origin,
  issuer, clientId, consumer }), ... }). The consumer must be created with
  createSub2apiConsumer from the reviewed runtime and matching origin/issuer/client.
- CLI: SUB2API_ACCOUNT_CONFIG is the absolute private JSON filename consumed by
  loadSub2apiAccountRuntime. Do not combine it with RITEL_ACCOUNT_CONFIG, demo,
  integration or an enabled SSO option. The default mode remains unchanged.
- Copy sub2api-account.config.example.json outside source control. Its issuer and
  OIDC endpoints are placeholders: select the exact central issuer and registered
  endpoints; all endpoints must stay on that issuer with no query/hash/credentials.
- Config directory/files and client secret are current-user-only: POSIX 0700/0600,
  or protected Windows owner-only DACL. All selected paths reject symbolic links;
  secret/state references must stay beneath the config directory. State must use
  a dedicated consumer SQLite file and must not alias config/secret files.
- runtimeRoot is an absolute reviewed runtime installation, owned by the app user or root and not writable by group/others, with
  runtime/sub2api-consumer/index.mjs, runtime/sub2api-issuer/first-party-login.mjs,
  their relative dependencies and maintained openid-client dependency installed.
  It is intentionally selected only by private config, never by a browser/Host.
  The loader fixes imports to those two files, pins metadata rather than doing
  startup discovery, and never executes arbitrary config modules.
- Primary configurations select https://visora.ritel.si. Optional
  LEGACY_SUB2API_ACCOUNT_CONFIG loads the unchanged images.ritel.si consumer.
  PUBLIC_ORIGINS must equal the selected consumer origins; PUBLIC_ORIGIN stays
  Visora during the two-consumer cutover. One application store/queue is shared,
  while OIDC transactions, consumer state and BFF sessions remain origin-bound.
  Host, original Origin and trusted proxy context select the matching consumer;
  workers select it from the persisted session binding. No request is rewritten.
  See ../deploy/VISORA.md for the fixed environment and independent state files.
- loopback-proxy requires an exact allowlisted immediate peer, matching Host,
  X-Forwarded-Host and X-Forwarded-Proto=https. The trusted proxy must overwrite
  X-Ritel-Client-IP with a single verified client IP. Arbitrary XFF is ignored.
  direct-tls reads the actual TLS socket peer and accepts no proxy override list.

Build locally using the existing npm run build:published entry. That bundle loads
this explicit runtime installation at startup; deployers must include the reviewed
runtime separately. No server-side compilation/source edit is required. Use the existing runtime at its reviewed version; do not replace it with a stale
copy from an older release or overwrite the latest session consumer module.

## Frontend contract

- Public homepage/static assets, GET /api/health and GET /api/config remain public.
- Config adds accountMode:'sub2api', accountOrigin:exactIssuer, ssoSources:[] and
  retains the existing model/chatModel/demo/integration fields.
- /auth/* is handled by the actual consumer, including the browser module, login,
  silent iframe callbacks, session, human activity and logout. No consumer demo
  page replaces the real Studio UI or gateway/queue/domain routes.
- Bootstrap the supplied browser consumer with authorizeOrigin=accountOrigin;
  /auth/session returns only safe user/CSRF. Then use the original /api/me to load
  original user/group/balance data. Verify consumer.user.uid==='sub2api:'+me.user.id.
- Protected HTTP always calls consumer.requireSession and verifies central native
  AT. Safe reads may omit CSRF/Origin so native img src and download links work;
  a supplied Origin must be exact. Sec-Fetch-Site, when present, must be same-origin
  or none. Unsafe requests require exact Origin and X-CSRF-Token from the consumer
  session. These checks are additional to normal cookie isolation/CORS.
- /api/me retains original safe user {id,username,email,balance}, groups, models,
  etc. It adds accountMode/accountOrigin and accountSecurityURL pointing to
  issuer + '/account/#security'. No AT/RT/session handles are returned.
- Old /api/login*, /api/demo-login and /api/sso* entry points return 404 in this mode.
- Prefer consumer.logout() (POST /auth/logout). POST /api/logout aliases that same
  central current-browser revocation with CSRF. It never calls legacy logout.
  Unknown central results clear local consumer state and return an error without
  claiming revocation or retrying it. Direct /auth/logout can leave an inert Studio
  binding until normal cleanup; it cannot authorize a queued task after revocation.
- Media stays on /api/media/:id, owner checked and private no-store in this mode.

## Identity, queue and persistence

No separate local account/entitlement layer. Subject must be sub2api:N and N must
match the original native integer ID. There is no email matching or force-enable.
The same UID owns existing threads/media/api_keys; encryption key and original
records are retained. Gateway groups/profile/createKey/converse/generate remain
the actual business implementation.

Studio adds only sub2api_account_sessions, binding its internal session hash to a
consumer key plus exact origin/issuer/client. Native AT remains encrypted using the
existing Studio secret; no RT is copied/refreshed locally in this mode. Background
binding updates preserve their prior local expiry. HTTP may renew only local cache
retention; central browser idle/revocation stays authoritative.

Consumer SQLite adds nullable trusted_context to consumer_sessions. Existing rows
obtain it after their next successful central check; no identity is guessed. Its
getSessionKey(req) and authorizeSessionKey(key) are server-only methods, with no new
HTTP route. The latter rechecks central using persisted sid/subject/last verified
context, checks the session still exists, and never invokes activity or renews
cookies. The consumer database stores no native AT/RT.

createQueue now optionally accepts a fourth argument {authorizeSession(hash,userId)}.
Sub2API mode verifies centrally when starting work, before ensureKey, and last before
actual gateway dispatch; profile/identity checks remain. The last local session and
job-owner check has no await before converse/generate. A central outage, expired or
revoked consumer, changed UID or deleted binding stops dispatch. There are no paid
request retries. Existing startup queued/running jobs retain the original unknown
recovery behavior. Shutdown drains admitted HTTP and queued/in-flight work before
closing either SQLite store; it cannot silently close state underneath a paid task.

## Verification and remaining acceptance

Module imports and a single temporary synthetic business smoke were executed on
local Node 24.19.0. The smoke used actual Studio HTTP/domain routes, actual consumer
SQLite/server APIs and the actual queue/store, with synthetic central and gateway
transports. It exercised original UID/history/key preservation, chat -> plan confirm
-> image/media, new-group createKey, duplicate confirm, blocked cross-site/unsafe
CSRF, revoked-before-dispatch failure, original unknown-job recovery, central logout,
and the restricted private runtime loader. It made 23 central checks, 1 synthetic
chat, 2 synthetic image dispatches, 1 key creation and 1 logout; no secrets appeared
in business responses. No suite was added. Initial smoke exposed a Windows ACL
reader module-autoload issue; the reader now uses native .NET access controls, and
the corrected smoke passed.

Root task still owns the combined build:published and integrated real browser/OIDC,
console/frontend acceptance. No actual central/native credentials, paid requests,
production DBs, proxy settings, issuer source changes or deployment were used here.
Validate exact registered callbacks, proxy overwrite rules, runtime artifact layout,
central idle/no-renewal behavior and real native core compatibility in that joint
acceptance. Synthetic dispatch proves local wiring, not production billing parity.

For the existing read-only Docker service, the optional deploy/sub2api-account.override.yaml mounts a dedicated owner-1000 private config/secret/SQLite directory read-write and the reviewed account runtime read-only. The overlay is inactive unless explicitly selected; it does not retire the old domain or change the existing deployment automatically. Keep config, client secret and consumer state separate from the existing Studio data encryption key and database.

## Target configuration check

Run the published backend with --check-config and an explicit SUB2API_ACCOUNT_CONFIG in the reviewed Node24 container. This loads the exact private consumer config and initializes its dedicated consumer schema, then closes it. It opens no HTTP listener, sends no native request and does not open the Studio business database. Keep the normal app stopped in that check container; do not mount the existing business data directory. Normal startup without this flag retains the existing behavior.
