const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function conversationImageUrl(id) {
  return typeof id === 'string' && ID.test(id) ? `/api/media/${id}` : null;
}

export function conversationImages(messages = []) {
  const images = new Map();
  const ordered = [...messages].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  // A generated image remains labelled as a result even when later turns reference it.
  for (const kind of ['generated', 'reference']) for (const message of ordered) {
    const items = kind === 'generated' ? (message.images || []) : (message.referenceIds || []).map(id => ({ id }));
    for (const [index, image] of items.entries()) {
      const url = conversationImageUrl(image.id);
      if (!url || images.has(image.id)) continue;
      const label = kind === 'generated' ? '生成图' : '参考图';
      images.set(image.id, { id: image.id, url, kind, label, name: `${label}-${index + 1}`, prompt: message.prompt || '', createdAt: message.createdAt || 0, threadId: message.threadId });
    }
  }
  return [...images.values()].sort((a, b) => b.createdAt - a.createdAt);
}
