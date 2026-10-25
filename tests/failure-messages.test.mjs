import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { classifyFailure, classifyConnectionFailure, createGateway } from '../server/gateway.mjs';

test('observed upstream failures provide distinct reasons and recovery without leaking raw detail', () => {
  for (const [status, detail, expected, reason, uncertain] of [
    [400, "Unknown parameter: 'tools[0].n'.", /不支持一次生成多张.*1 张/, 'batch_unsupported', false],
    [502, 'Upstream did not execute image generation', /未执行生图.*未立即|未执行生图.*请勿立即/, 'upstream_no_generation', true],
    [502, 'Upstream service temporarily unavailable', /上游生图服务暂时不可用.*502/, 'upstream_unavailable', true],
    [429, 'The usage limit has been reached', /上游生图服务的可用额度/, 'upstream_quota', false],
    [429, 'insufficient_quota', /上游生图服务的可用额度/, 'upstream_quota', false],
    [429, 'Too many requests', /触发限流.*稍后再试/, 'rate_limited', false],
    [504, 'Gateway timeout', /等待上游生图响应超时.*请勿立即/, 'upstream_timeout', true],
    [401, 'Expired credential', /访问凭证已失效.*重新登录/, 'authentication_expired', false],
    [403, 'Access denied', /访问权限.*更换可用分组/, 'access_denied', false]
  ]) {
    const failure = classifyFailure(status, { error: { message: `${detail} sk-private-fixture-do-not-display` } });
    assert.match(failure.message, expected);
    assert.equal(failure.reason, reason);
    assert.equal(failure.uncertain, uncertain);
    assert.match(failure.message, /panrui12/);
    assert.doesNotMatch(failure.message, /sk-private|不会扣费|已退款/);
    if (reason === 'upstream_quota') assert.doesNotMatch(failure.message, /余额不足|充值/);
  }
  assert.notEqual(classifyFailure(400, { error: { message: "Unknown parameter: 'quality'." } }).reason, 'batch_unsupported');
});

test('network failures distinguish waiting, interrupted result transfer, and disconnection', () => {
  for (const [code, expected, status] of [
    ['UND_ERR_HEADERS_TIMEOUT', /等待上游生图响应超时/, 504],
    ['UND_ERR_BODY_TIMEOUT', /接收上游生图结果超时/, 504],
    ['ECONNRESET', /连接中断/, 502]
  ]) {
    const failure = classifyConnectionFailure(new TypeError('private transport detail', { cause: { code } }));
    assert.match(failure.message, expected);
    assert.equal(failure.networkCode, code);
    assert.equal(failure.status, status);
    assert.equal(failure.uncertain, true);
    assert.match(failure.message, /请勿立即重复提交.*panrui12/);
    assert.doesNotMatch(failure.message, /private transport/);
  }
});

test('invalid successful responses remain uncertain and HTML service errors retain their HTTP cause', async () => {
  let status = 200;
  const server = createServer((_req, res) => { res.writeHead(status, { 'content-type': 'text/html' }); res.end('<html>private upstream response</html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const gateway = createGateway(`http://127.0.0.1:${server.address().port}`, 'gpt-image-2.5');
    const input = { prompt: 'fixture', size: '2K', count: 1, references: [] };
    await assert.rejects(gateway.generate('fixture-key', input), error => error.reason === 'invalid_response' && error.uncertain && !error.message.includes('private upstream'));
    status = 503;
    await assert.rejects(gateway.generate('fixture-key', input), error => error.reason === 'upstream_unavailable' && error.message.includes('503') && error.uncertain);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
