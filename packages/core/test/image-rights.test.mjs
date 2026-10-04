import test from 'node:test';
import assert from 'node:assert/strict';
import { completeKnowledgeImageRights } from '../dist/index.js';

test('publishable image attribution never carries private hosts or URL credentials', () => {
  const rights = sourceUrl => ({ license: 'CC BY 4.0', author: 'source author', sourceUrl });
  for (const url of [
    'http://127.0.0.1:4390/private',
    'https://host.internal./private',
    'https://host.internal./private?token=secret',
    'https://localhost./private',
    'https://example.org/photo?token=secret',
    'https://example.org/photo#private',
  ]) assert.equal(completeKnowledgeImageRights(rights(url)), false, url);
  assert.equal(completeKnowledgeImageRights(rights('https://example.org/photo')), true);
});
