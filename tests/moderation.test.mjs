import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { classifyFailure, createGateway } from '../server/gateway.mjs';

test('content refusals explain the reason before conditional billing support', () => {
  for (const [status, body] of [
    [400, { error: { code: 'content_policy_violation', message: 'Request rejected.' } }],
    [403, { error: { message: 'Your request was rejected by our safety system.' } }],
    [502, { error: { message: '上游拒绝：提示词包含违禁词' } }],
    [400, { message: '参考图片内容违规，包含色情内容' }],
    [200, { error: { type: 'content_filter' } }]
  ]) {
    const error = classifyFailure(status, body);
    assert.equal(error.status, 400);
    assert.equal(error.uncertain, false);
    assert.match(error.message, /^提示词或参考图未通过内容审核/);
    assert.match(error.message, /若发现余额已扣除.*panrui12/);
    assert.doesNotMatch(error.message, /不会扣费|已退款/);
  }
});

test('unrelated failures are never mislabeled as content moderation', () => {
  for (const body of [{ error: { message: 'Upstream timeout' } }, { error: { code: 'image_generation_user_error', message: 'Invalid image dimensions' } }]) {
    assert.doesNotMatch(classifyFailure(502, body).message, /内容审核/);
  }
  assert.equal(classifyFailure(502, { message: 'Upstream timeout' }).uncertain, true);
  assert.match(classifyFailure(402, { error: { message: 'insufficient balance' } }).message, /余额不足/);
});

test('generation and edit refusals also detect error envelopes returned with HTTP 200', async () => {
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'content_policy_violation' } })); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const gateway = createGateway(`http://127.0.0.1:${server.address().port}`, 'gpt-image-2.5');
    for (const references of [[], [{ mime: 'image/png', bytes: Buffer.from('fixture') }]]) {
      await assert.rejects(gateway.generate('fixture-key', { prompt: 'fixture', size: '2K', count: 1, references }), (error) => error.message.startsWith('提示词或参考图未通过内容审核') && !error.uncertain);
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
