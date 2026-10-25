import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyAccountFailure, createGateway } from '../server/gateway.mjs';
import { createApplication } from '../server/index.mjs';

const noGenerationAdvice = message => assert.doesNotMatch(message, /生图|生成|提示词|扣费|扣除|余额|参考图|fixture-secret/);

test('wrong password errors are recognized in login responses without image/billing instructions', () => {
  for (const [status, body] of [
    [400, { code: 400, message: 'Invalid email or password' }],
    [400, { reason: 'INVALID_CREDENTIALS', message: 'fixture-secret' }],
    [401, { error: { code: 'INVALID_PASSWORD', message: 'fixture-secret' } }],
    [200, { code: 400, message: '邮箱或密码错误' }],
    [200, { error: 'invalid credentials' }],
    [401, {}]
  ]) {
    const failure = classifyAccountFailure(status, body, '/api/v1/auth/login');
    assert.equal(failure.message, '邮箱或密码不正确，请检查后重试。');
    assert.equal(failure.status, 401); assert.equal(failure.uncertain, false);
    noGenerationAdvice(failure.message);
  }
});

test('captcha, disabled accounts, OTP, throttling and outages keep distinct login reasons', () => {
  for (const [path, status, body, expected] of [
    ['/auth/login',400,{reason:'TURNSTILE_REQUIRED'},'login_verification_required'],
    ['/auth/login',403,{reason:'ACCOUNT_DISABLED'},'account_disabled'],
    ['/auth/login',429,{message:'Invalid password'},'account_rate_limited'],
    ['/auth/login',502,{message:'Invalid password'},'account_unavailable'],
    ['/auth/login',400,{message:'unknown fixture-secret'},'login_rejected'],
    ['/auth/login/2fa',401,{reason:'INVALID_TOTP_CODE'},'login_code_invalid'],
    ['/auth/login/2fa',400,{reason:'TEMP_TOKEN_EXPIRED'},'login_challenge_expired'],
    ['/auth/me',401,{message:'invalid token'},'authentication_expired'],
    ['/groups/available',403,{},'account_access_denied']
  ]) {
    const error=classifyAccountFailure(status,body,'/api/v1'+path);
    assert.equal(error.reason,expected); noGenerationAdvice(error.message);
  }
});

test('real login endpoint propagates password errors, creates no session and still accepts a corrected login', async () => {
  const directory=mkdtempSync(join(tmpdir(),'studio-login-error-'));
  const calls=[];let mode='wrong';
  const upstream=createServer(async(req,res)=>{
    calls.push(req.url);for await(const part of req) { /* Do not retain request credentials. */ }
    const body=mode==='wrong'?{code:400,message:'Invalid email or password'}:
      mode==='envelope'?{code:400,reason:'INVALID_CREDENTIALS',message:'fixture-secret'}:
      mode==='captcha'?{code:400,reason:'TURNSTILE_REQUIRED'}:
      mode==='outage'?null:
      {code:0,data:{access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,user:{id:900980,email:'fixture@example.invalid',status:'active',balance:0}}};
    res.writeHead(mode==='wrong'||mode==='captcha'?400:mode==='outage'?502:200,{'content-type':mode==='outage'?'text/html':'application/json'});
    res.end(mode==='outage'?'<html>private upstream diagnostic</html>':JSON.stringify(body));
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const gateway=createGateway(`http://127.0.0.1:${upstream.address().port}`,'gpt-image-2.5');
  const app=createApplication({dataDir:directory,gateway});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const login=async()=>{
    const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'fixture@example.invalid',password:'fixture-only-password'})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
  };
  try {
    for(const value of ['wrong','envelope']) {
      mode=value;const response=await login();assert.equal(response.status,401);assert.equal(response.data.error,'邮箱或密码不正确，请检查后重试。');assert.equal(response.cookie,null);
      assert.equal(app.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
    }
    mode='captcha';const captcha=await login();assert.match(captcha.data.error,/人机验证/);assert.equal(captcha.status,400);
    mode='outage';const outage=await login();assert.match(outage.data.error,/登录服务暂时不可用/);assert.equal(outage.status,502);assert.doesNotMatch(outage.data.error,/private upstream/);
    mode='ok';const success=await login();assert.equal(success.status,200);assert.match(success.cookie,/studio_sid=/);assert.equal(success.data.user.id,900980);
    assert.equal(app.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n,1);
    assert.equal(app.store.db.prepare('SELECT count(*) AS n FROM messages').get().n,0);
    assert.ok(calls.every(path=>path==='/api/v1/auth/login'));
  } finally {
    await new Promise(resolve=>app.server.close(resolve));app.close();await new Promise(resolve=>upstream.close(resolve));rmSync(directory,{recursive:true,force:true});
  }
});
