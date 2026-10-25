import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationImageUrl, conversationImages } from '../src/editor-ui/conversation-images.mjs';
const a = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
test('conversation picker uses protected same-origin media paths and never follows supplied image URLs', () => {
  assert.equal(conversationImageUrl(a), '/api/media/' + a);
  for (const value of ['https://example.invalid/image.jpg', '../secret', null, 'abc', a + '?token=fixture']) assert.equal(conversationImageUrl(value), null);
  const images = conversationImages([{ id: 'm', images: [{ id: a, url: 'https://example.invalid/track' }, { id: '../bad' }], referenceIds: [b, 'not-an-id'] }]);
  assert.deepEqual(images.map(image => image.url), ['/api/media/' + a, '/api/media/' + b]);
});
test('generated images reused as references remain results, deduplicate, and sort newest first', () => {
  const images = conversationImages([
    { id: 'first', prompt: 'first prompt', createdAt: 100, images: [{ id: a }], referenceIds: [b] },
    { id: 'second', prompt: 'later reference', createdAt: 200, images: [], referenceIds: [a, b] }
  ]);
  assert.equal(images.length, 2);
  assert.equal(images[0].id, b); assert.equal(images[0].kind, 'reference');
  assert.equal(images[1].id, a); assert.equal(images[1].kind, 'generated'); assert.equal(images[1].prompt, 'first prompt');
  assert.deepEqual(conversationImages([]), []);
});
