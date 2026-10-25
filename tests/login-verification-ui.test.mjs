import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, realpath, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// All endpoints and the verification widget are local fixtures. Never solve/replay a real challenge.
test('login verification refresh, one-use submission, expiry, and account error UI', {
  skip: process.env.LOGIN_BROWSER_TESTS !== '1', timeout: 120_000
}, async () => {
  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { ({ chromium } = require(join(process.env.APPDATA, 'npm/node_modules/playwright'))); }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), 'studio-login-ui-'));
  const vite = await createServer({ configFile: false, root, cacheDir: join(temporary, 'vite-cache'),
    plugins: [react()], logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null },
    optimizeDeps: { include: ['react', 'react-dom/client', 'lucide-react'] }
  });
  let browser, release;
  try {
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const errors = [], posts = [], unexpected = [];
    let replyStatus = 400, reply = { error: '人机验证未通过或已过期，请重新完成验证后登录。' }, hold = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const clock = Date.now.bind(Date);
      window.__verificationClockOffset = 0;
      Date.now = () => clock() + window.__verificationClockOffset;
      window.__verificationWidgets = []; window.__currentVerification = null;
      window.turnstile = {
        render(element, callbacks) {
          const id = `local-fixture-${window.__verificationWidgets.length}`;
          const widget = { id, callbacks, element, removed: false };
          window.__verificationWidgets.push(widget); window.__currentVerification = widget;
          element.textContent = '本地测试验证组件'; return id;
        },
        remove(id) {
          const widget = window.__verificationWidgets.find(item => item.id === id);
          if (widget) { widget.removed = true; widget.element.textContent = ''; }
        }
      };
    });
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) { unexpected.push(url.origin); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const send = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/api/config') return send(200, { demo: false, ssoSources: [] });
      if (url.pathname === '/api/me') return send(401, { error: '请先登录。' });
      if (url.pathname === '/api/login-config') return send(200, { turnstileEnabled: true, turnstileSiteKey: 'local-test-config' });
      if (url.pathname === '/api/login') {
        posts.push(req.postDataJSON());
        if (hold) await new Promise(resolve => { release = resolve; });
        return send(replyStatus, reply);
      }
      unexpected.push(url.pathname); return send(404, { error: 'Unexpected fixture route' });
    });
    await page.goto(`${origin}/#account-entry`, { waitUntil: 'networkidle' });
    const form = page.locator('.login-content form');
    const login = page.getByRole('button', { name: '登录', exact: true });
    const complete = value => page.evaluate(value => window.__currentVerification.callbacks.callback(value), value);
    const widgets = () => page.evaluate(() => window.__verificationWidgets.length);
    const waitNext = count => page.waitForFunction(count => window.__verificationWidgets.length > count && !window.__currentVerification.removed, count);
    await login.waitFor(); assert.equal(await login.isDisabled(), true);
    await page.getByLabel('邮箱', { exact: true }).fill('login-fixture@example.invalid');
    await page.getByLabel('密码', { exact: true }).fill('local-fixture-password');
    await complete('local-first-proof');
    await page.getByText('验证已完成，请点击登录。', { exact: true }).waitFor();
    const firstCount = await widgets();
    await form.evaluate(element => { for (let i = 0; i < 4; i++) element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert(release); assert.equal(posts.length, 1); assert.equal(posts[0].turnstileToken, 'local-first-proof');
    assert.equal(await login.isDisabled(), true);
    release(); release = null; hold = false;
    await page.getByRole('alert').filter({ hasText: '人机验证未通过' }).waitFor(); await waitNext(firstCount);
    await complete('local-fresh-proof');
    await page.waitForFunction(() => !document.querySelector('.login-content [role="alert"]'));
    assert.equal(await login.isDisabled(), false);
    // Real account errors survive refreshing a CAPTCHA.
    replyStatus = 401; reply = { error: '邮箱或密码不正确，请检查后重试。' };
    const secondCount = await widgets(); await login.click();
    await page.getByRole('alert').filter({ hasText: '邮箱或密码不正确' }).waitFor(); await waitNext(secondCount);
    await complete('local-account-retry-proof');
    assert.match(await page.getByRole('alert').innerText(), /邮箱或密码不正确/);
    // A removed widget must not inject a previous proof into the active attempt.
    await page.evaluate(() => {
      window.__currentVerification.callbacks['expired-callback']();
      window.__verificationWidgets[0].callbacks.callback('local-obsolete-widget-proof');
    });
    await page.getByText('验证已过期，请重新验证。', { exact: true }).waitFor();
    assert.equal(await login.isDisabled(), true);
    const expiredCount = await widgets(); await page.getByRole('button', { name: '重新验证', exact: true }).click(); await waitNext(expiredCount);
    await complete('local-aging-proof');
    const beforeExpiredSubmit = posts.length, agingCount = await widgets();
    await page.evaluate(() => { window.__verificationClockOffset = 291_000; });
    await login.click(); await waitNext(agingCount);
    assert.equal(posts.length, beforeExpiredSubmit);
    await page.getByRole('alert').filter({ hasText: '人机验证已过期' }).waitFor();
    await complete('local-renewed-proof');
    await page.waitForFunction(() => !document.querySelector('.login-content [role="alert"]'));
    // Explicit refresh remains accessible even after a successful widget result.
    const refreshCount = await widgets(); await page.getByRole('button', { name: '重新验证', exact: true }).click(); await waitNext(refreshCount);
    assert.equal(await login.isDisabled(), true);
    await complete('local-accepted-proof');
    replyStatus = 200; reply = { requires2FA: true, tempToken: 'local-two-factor-fixture' };
    await login.click(); await page.getByLabel('两步验证码', { exact: true }).waitFor();
    assert.equal(await page.locator('.turnstile-container').count(), 0);
    assert.equal(posts.at(-1).turnstileToken, 'local-accepted-proof');
    assert.equal(posts.length, 3);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    const output = join(root, 'data', 'visual-check', 'login-verification'); await mkdir(output, { recursive: true });
    console.log(JSON.stringify({ loginVerificationUI: 'PASS', duplicatePostsPrevented: true, freshProofClearsOnlyCaptchaError: true,
      expiredProofNotSubmitted: true, removedWidgetIgnored: true, manualRefresh: true, twoFactorTransition: true, realLogins: 0 }));
  } finally {
    release?.(); await browser?.close(); await vite.close();
    const target = await realpath(temporary), parent = await realpath(tmpdir());
    if (!target.toLowerCase().startsWith((resolve(parent) + sep).toLowerCase()) || !basename(target).startsWith('studio-login-ui-')) throw new Error('Unexpected login test cleanup target');
    await rm(target, { recursive: true, force: true });
  }
});
