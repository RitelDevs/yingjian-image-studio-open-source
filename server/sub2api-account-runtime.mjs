import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, dirname, isAbsolute, relative, join, parse } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isIP } from 'node:net';
import { execFileSync } from 'node:child_process';
import { createSub2apiAccount, SUB2API_STUDIO_ORIGINS } from './sub2api-account.mjs';

const invalid = () => new Error('Sub2API Studio private configuration is unavailable or invalid');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function fields(value, required, optional = []) {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) throw invalid();
}
function checkedPath(file, { directory = false, secret = true } = {}) {
  if (typeof file !== 'string' || !isAbsolute(file) || resolve(file) !== file) throw invalid();
  // No symlink aliases, including any ancestor of the selected configuration/code.
  let cursor = parse(file).root;
  for (const part of file.slice(cursor.length).split(/[/\\]/).filter(Boolean)) {
    cursor = join(cursor, part);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink()) throw invalid();
    if (process.platform !== 'win32' && (info.mode & 0o022) && !(info.uid === 0 && (info.mode & 0o1000))) throw invalid();
  }
  const info = lstatSync(file);
  if (realpathSync(file) !== file || (directory ? !info.isDirectory() : !info.isFile()) || (!directory && info.nlink !== 1)) throw invalid();
  if (process.platform !== 'win32') {
    if ((info.uid !== process.getuid() && (secret || info.uid !== 0)) || (secret && (info.mode & 0o077))) throw invalid();
  } else if (secret) {
    const encoded = Buffer.from(file, 'utf16le').toString('base64');
    const script = `$ErrorActionPreference='Stop';$p=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'));$a=[IO.${directory ? 'Directory' : 'File'}]::GetAccessControl($p);$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$r=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if(!$a.AreAccessRulesProtected -or $a.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or $r.Count -ne 1 -or $r[0].IdentityReference.Value -ne $sid.Value -or $r[0].AccessControlType -ne 'Allow' -or $r[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl){throw 'ACL'}`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: 'pipe', windowsHide: true });
  }
  return file;
}
const normalizedIP = value => typeof value === 'string' && value.startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value;
function single(req, name, optional = false) {
  const count = req.rawHeaders.filter((_, index) => index % 2 === 0).filter(key => key.toLowerCase() === name).length;
  const value = req.headers[name];
  if (optional && count === 0 && value === undefined) return undefined;
  if (count !== 1 || typeof value !== 'string' || !value) throw invalid();
  return value;
}

// Used by the single- and dual-origin consumers at the trusted proxy boundary.
export function createSub2apiTrustedContext({ origin, transport, trustedProxyIPs: peers = ['127.0.0.1', '::1'] }) {
  return req => {
    const host = new URL(origin).host;
    if (single(req, 'host') !== host || typeof req.url !== 'string' || !req.url.startsWith('/') || req.url.startsWith('//') || /[\\\x00-\x20\x7f]/.test(req.url)) throw invalid();
    let clientIp;
    if (transport === 'loopback-proxy') {
      if (!peers.includes(normalizedIP(req.socket.remoteAddress)) || req.socket.encrypted ||
          single(req, 'x-forwarded-host') !== host || single(req, 'x-forwarded-proto') !== 'https') throw invalid();
      clientIp = single(req, 'x-ritel-client-ip'); // proxy must overwrite, never accept an XFF list
    } else {
      if (!req.socket.encrypted) throw invalid();
      clientIp = normalizedIP(req.socket.remoteAddress);
    }
    if (!isIP(clientIp)) throw invalid();
    return { clientIp, userAgent: single(req, 'user-agent'), acceptLanguage: single(req, 'accept-language', true) };
  };
}

// Only this JSON file selects a reviewed runtime installation. No arbitrary JS
// config, discovery redirect, client supplied forwarding chain or env token is used.
export async function loadSub2apiAccountRuntime(configPath) {
  let consumer;
  try {
    checkedPath(configPath); const configRoot = checkedPath(dirname(configPath), { directory: true });
    const bytes = readFileSync(configPath); if (bytes.length > 16384) throw invalid();
    const config = JSON.parse(bytes.toString('utf8'));
    fields(config, ['version', 'origin', 'issuer', 'clientId', 'clientSecretFile', 'stateFile', 'runtimeRoot', 'transport', 'oidc'], ['trustedProxyIPs']);
    if (config.version !== 1 || !SUB2API_STUDIO_ORIGINS.includes(config.origin) || new URL(config.issuer).origin !== config.issuer ||
        !config.issuer.startsWith('https://') || !/^[A-Za-z0-9_-]{1,64}$/.test(config.clientId) ||
        !['direct-tls', 'loopback-proxy'].includes(config.transport)) throw invalid();
    const inside = value => {
      if (typeof value !== 'string' || !value || isAbsolute(value)) throw invalid();
      const file = resolve(configRoot, value), rel = relative(configRoot, file);
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw invalid();
      return file;
    };
    const clientSecret = readFileSync(checkedPath(inside(config.clientSecretFile)), 'utf8').trim();
    if (clientSecret.length < 32 || clientSecret.length > 4096 || /[\x00-\x20\x7f]/.test(clientSecret)) throw invalid();
    const stateFile = inside(config.stateFile);
    if (stateFile === configPath || stateFile === inside(config.clientSecretFile)) throw invalid();
    checkedPath(dirname(stateFile), { directory: true }); // consumer enforces SQLite mode/ACL itself
    checkedPath(config.runtimeRoot, { directory: true, secret: false });
    const runtimeModule = checkedPath(join(config.runtimeRoot, 'runtime/sub2api-consumer/index.mjs'), { secret: false });
    const oidcModule = checkedPath(join(config.runtimeRoot, 'runtime/sub2api-issuer/first-party-login.mjs'), { secret: false });
    const peers = config.trustedProxyIPs ?? ['127.0.0.1', '::1'];
    if (!Array.isArray(peers) || !peers.length || peers.length > 16 || peers.some(ip => !isIP(ip) || normalizedIP(ip) !== ip) ||
        (config.transport === 'direct-tls' && config.trustedProxyIPs !== undefined)) throw invalid();
    const getTrustedContext = createSub2apiTrustedContext(config);
    const issuer = config.issuer;
    fields(config.oidc, ['authorizationEndpoint', 'tokenEndpoint', 'jwksURI']);
    for (const endpoint of Object.values(config.oidc)) {
      const url = new URL(endpoint);
      if (url.origin !== issuer || url.username || url.password || url.hash || url.search) throw invalid();
    }
    const { createSub2apiConsumer } = await import(pathToFileURL(runtimeModule).href);
    const { oidcClient } = await import(pathToFileURL(oidcModule).href);
    const configuration = new oidcClient.Configuration({ issuer, authorization_endpoint: config.oidc.authorizationEndpoint,
      token_endpoint: config.oidc.tokenEndpoint, jwks_uri: config.oidc.jwksURI, response_types_supported: ['code'],
      subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'] }, config.clientId, { client_secret: clientSecret, id_token_signed_response_alg: 'RS256' },
      oidcClient.ClientSecretBasic(clientSecret));
    consumer = createSub2apiConsumer({ origin: config.origin, issuer, clientId: config.clientId, clientSecret, configuration, stateFile, getTrustedContext });
    return createSub2apiAccount({ origin: config.origin, issuer, clientId: config.clientId, consumer, getTrustedContext });
  } catch {
    try { consumer?.close(); } catch {}
    throw invalid();
  }
}
