import test from 'node:test';
import assert from 'node:assert/strict';
import { WebsiteProvider } from '../dist/provider.js';

const row = { game_id: 7230, game_name: 'Portal', comp_main: 900, comp_plus: 1800, comp_100: 3600, profile_platform: 'PC, Linux' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const page = game => new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { game: { data: { game } } } } })}</script>`);

test('current search initializes session, keeps same headers and preserves sub-hour times', async () => {
  const requests = [];
  const provider = new WebsiteProvider(async (url, options) => {
    requests.push({ url, options });
    if (url.includes('/init?')) return json({ token: 'session' });
    assert.equal(url, 'https://howlongtobeat.com/api/search/site');
    assert.equal(options.headers['x-auth-token'], 'session');
    assert.ok(!('x-hp-key' in options.headers));
    assert.deepEqual(JSON.parse(options.body).searchTerms, ['Portal', '2']);
    return json({ data: [row] });
  });
  const games = await provider.search('Portal 2');
  assert.equal(games[0].gameplayMain, 0.25);
  await provider.search('Portal 2');
  assert.equal(requests.filter(r => r.url.includes('/init?')).length, 1);
  for (const { options } of requests) {
    assert.equal(options.headers['User-Agent'], 'Mozilla/5.0');
    assert.equal(options.headers.Origin, 'https://howlongtobeat.com');
    assert.equal(options.headers.Referer, 'https://howlongtobeat.com/');
    assert.equal(options.redirect, 'error');
  }
});
test('rejected session is renewed once with optional session fields', async () => {
  let initCount = 0, posts = 0;
  const provider = new WebsiteProvider(async (url, options) => {
    if (url.includes('/init?')) return json({ token: `session${++initCount}`, hpKey: 'key', hpVal: 'val' });
    posts++;
    assert.equal(options.headers['x-hp-key'], 'key');
    assert.equal(options.headers['x-hp-val'], 'val');
    if (posts === 1) return json({}, 403);
    assert.equal(options.headers['x-auth-token'], 'session2');
    return json({ data: [row] });
  });
  assert.equal((await provider.search('Portal')).length, 1);
  assert.equal(initCount, 2);
  assert.equal(posts, 2);
});
test('persistent 403 stops after one renewal and never exposes token or response', async () => {
  let calls = 0;
  const provider = new WebsiteProvider(async url => {
    calls++;
    return url.includes('/init?') ? json({ token: 'secret' }) : new Response('secret', { status: 403 });
  });
  await assert.rejects(() => provider.search('Portal'), error => error.code === 'UPSTREAM_FORBIDDEN' && !error.message.includes('secret'));
  assert.equal(calls, 4);
});
test('rate limiting is surfaced without retries', async () => {
  let calls = 0;
  const provider = new WebsiteProvider(async () => { calls++; return json({}, 429); });
  await assert.rejects(() => provider.search('Portal'), { code: 'UPSTREAM_RATE_LIMITED' });
  assert.equal(calls, 1);
});
test('detail reads structured data at canonical URL, ignoring unrelated games', async () => {
  const provider = new WebsiteProvider(async url => {
    assert.equal(url, 'https://howlongtobeat.com/game/7230');
    return page([{ ...row, game_id: 999, game_name: 'Wrong game' }, row]);
  });
  const game = await provider.detail('7230');
  assert.equal(game.name, 'Portal');
  assert.equal(game.gameplayMain, 0.25);
  assert.deepEqual(game.platforms, ['PC', 'Linux']);
});
test('missing estimates remain unknown; multiplayer duration is not substituted', async () => {
  const provider = new WebsiteProvider(async () => page([{ game_id: 7230, game_name: 'Portal', comp_main: null, invested_mp: 90000 }]));
  assert.equal((await provider.detail('7230')).gameplayMain, 0);
});
test('invalid sessions and invalid JSON are explicit format errors', async () => {
  for (const response of [json({}), new Response('<html>blocked</html>')]) {
    await assert.rejects(() => new WebsiteProvider(async () => response).search('Portal'), { code: 'UPSTREAM_FORMAT_CHANGED' });
  }
});
test('malformed search data is not treated as no results', async () => {
  const provider = new WebsiteProvider(async url => url.includes('/init?') ? json({ token: 'session' }) : json({ unexpected: [] }));
  await assert.rejects(() => provider.search('Portal'), { code: 'UPSTREAM_FORMAT_CHANGED' });
});
test('detail rejects HTML changes, wrong ID, HTTP errors and unsafe input', async () => {
  for (const response of [new Response('<html></html>'), page([{ ...row, game_id: 999 }])]) {
    await assert.rejects(() => new WebsiteProvider(async () => response).detail('7230'), { code: 'UPSTREAM_FORMAT_CHANGED' });
  }
  await assert.rejects(() => new WebsiteProvider(async () => json({}, 404)).detail('7230'), { code: 'UPSTREAM_NOT_FOUND' });
  await assert.rejects(() => new WebsiteProvider(async () => { throw new Error('Must not fetch'); }).detail('../secret'), { code: 'INVALID_GAME_ID' });
});
test('cancellation signal reaches initialization, search and detail', async () => {
  const controller = new AbortController();
  const provider = new WebsiteProvider(async (url, options) => {
    assert.equal(options.signal, controller.signal);
    if (url.includes('/init?')) return json({ token: 'session' });
    return url.includes('/api/') ? json({ data: [] }) : page([row]);
  });
  await provider.search('Portal', controller.signal);
  await provider.detail('7230', controller.signal);
});
