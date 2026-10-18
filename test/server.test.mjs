import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from '../dist/server.js';
import { GameService, normalize } from '../dist/service.js';

const entry = {
  id: '7230', name: 'Portal', description: 'A puzzle game.', platforms: ['PC'],
  imageUrl: 'https://howlongtobeat.com/games/portal.jpg',
  gameplayMain: 3, gameplayMainExtra: 5, gameplayCompletionist: 10,
  timeLabels: [['Main', 'Main'], ['Main + Extra', 'Main + Extra'], ['Completionist', 'Completionist']],
  similarity: 1, searchTerm: 'Portal', playableOn: ['PC'],
};
async function connect(provider) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(new GameService(provider));
  const client = new Client({ name: 'test', version: '1' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}
const provider = { search: async () => [entry], detail: async () => entry };

test('MCP discovers two read-only tools and defaults to compact output', async () => {
  const ctx = await connect(provider);
  try {
    const list = await ctx.client.listTools();
    assert.equal(list.tools.length, 2);
    assert.ok(list.tools.every(t => t.annotations.readOnlyHint));
    const response = await ctx.client.callTool({ name: 'hltb_search_games', arguments: { query: 'Portal' } });
    assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent);
    assert.equal(response.structuredContent.games[0].times_hours.main, 3);
    assert.equal(response.structuredContent.games[0].description, undefined);
    assert.equal(response.structuredContent.coverage, 'upstream_first_page_only');
  } finally { await ctx.close(); }
});
test('detail includes metadata when requested', async () => {
  const ctx = await connect(provider);
  try {
    const r = await ctx.client.callTool({ name: 'hltb_get_game', arguments: { game_id: '7230', detail: 'detailed' } });
    assert.equal(r.structuredContent.game.description, entry.description);
    assert.equal(r.structuredContent.game.similarity, undefined);
  } finally { await ctx.close(); }
});
test('invalid input is rejected before any provider call', async () => {
  let calls = 0;
  const ctx = await connect({ search: async () => { calls++; return []; }, detail: async () => { calls++; return entry; } });
  try {
    for (const [name, args] of [
      ['hltb_search_games', { query: '   ' }], ['hltb_search_games', { query: 'Portal', limit: 21 }],
      ['hltb_search_games', { query: 'Portal', detail: 'invalid' }],
      ['hltb_get_game', { game_id: '../../secret' }], ['hltb_get_game', { game_id: '0' }],
    ]) {
      const r = await ctx.client.callTool({ name, arguments: args });
      assert.equal(r.isError, true);
    }
    assert.equal(calls, 0);
  } finally { await ctx.close(); }
});
test('upstream failure is an error, not an empty search; internals are hidden', async () => {
  const ctx = await connect({ ...provider, search: async () => { throw new Error('token=secret'); } });
  try {
    const r = await ctx.client.callTool({ name: 'hltb_search_games', arguments: { query: 'Portal' } });
    assert.equal(r.isError, true);
    assert.equal(r.structuredContent.error.code, 'UPSTREAM_UNAVAILABLE');
    assert.ok(!JSON.stringify(r).includes('secret'));
  } finally { await ctx.close(); }
});
test('zero, negative and non-finite times remain unknown', () => {
  assert.deepEqual(normalize({ ...entry, gameplayMain: 0, gameplayMainExtra: -1, gameplayCompletionist: NaN }, 'compact', true).times_hours,
    { main: null, main_extra: null, completionist: null });
});
test('no results and truncation have explicit coverage', async () => {
  const empty = await new GameService({ ...provider, search: async () => [] }).search('absent', 5, 'compact');
  assert.equal(empty.status, 'no_results');
  const page = await new GameService({ ...provider, search: async () => [entry, entry] }).search('Portal', 1, 'compact');
  assert.equal(page.truncated, true);
  assert.equal(page.available_in_page, 2);
});
test('changed response shape and mismatched ID fail explicitly', async () => {
  await assert.rejects(() => new GameService({ ...provider, search: async () => null }).search('Portal', 5, 'compact'), { code: 'UPSTREAM_FORMAT_CHANGED' });
  await assert.rejects(() => new GameService(provider).get('999', 'compact'), { code: 'UPSTREAM_FORMAT_CHANGED' });
  assert.throws(() => normalize({ ...entry, name: '' }, 'compact', false), { code: 'UPSTREAM_FORMAT_CHANGED' });
});
test('timeout and cancellation propagate to provider', async () => {
  let received;
  const slow = { ...provider, search: async (_, signal) => { received = signal; await new Promise(resolve => setTimeout(resolve, 50)); return [entry]; } };
  await assert.rejects(() => new GameService(slow, 5).search('Portal', 5, 'compact'), { code: 'TIMEOUT' });
  assert.equal(received.aborted, true);
  await assert.rejects(() => new GameService(provider).search('Portal', 5, 'compact', AbortSignal.abort()), { code: 'CANCELLED' });
});
test('actual executable completes stdio handshake without stdout noise', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))], stderr: 'pipe' });
  const client = new Client({ name: 'stdio-test', version: '1' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 2);
    const r = await client.callTool({ name: 'hltb_get_game', arguments: { game_id: 'invalid' } });
    assert.equal(r.isError, true);
  } finally { await client.close(); }
});
