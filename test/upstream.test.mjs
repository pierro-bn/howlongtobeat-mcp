import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { HowLongToBeatService } from 'howlongtobeat';
import upstream from 'howlongtobeat/dist/main/hltbsearch.js';

test('upstream library and updated Axios read search JSON and detail HTML', async () => {
  const http = createServer(async (req, res) => {
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      assert.deepEqual(JSON.parse(body).searchTerms, ['Portal']);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: [{ game_id: 7230, game_name: 'Portal', profile_platform: 'PC', game_image: 'portal.jpg', comp_main: 10800, comp_plus: 18000, comp_100: 36000 }] }));
    } else {
      res.setHeader('content-type', 'text/html');
      res.end('<div class="GameHeader_profile_header__test">Portal</div><div class="GameHeader_game_image__test"><img src="portal.jpg"></div><div class="GameStats_game_times__test"><ul><li><h4>Main Story</h4><h5>3 Hours</h5></li><li><h4>Main + Sides</h4><h5>5½ Hours</h5></li></ul></div>');
    }
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const { HltbSearch } = upstream;
  const oldSearch = HltbSearch.SEARCH_URL, oldDetail = HltbSearch.DETAIL_URL;
  const base = `http://127.0.0.1:${http.address().port}`;
  HltbSearch.SEARCH_URL = base;
  HltbSearch.DETAIL_URL = `${base}/?id=`;
  try {
    const service = new HowLongToBeatService();
    const games = await service.search('Portal', AbortSignal.timeout(2000));
    assert.equal(games[0].id, '7230');
    assert.equal(games[0].gameplayMain, 3);
    const game = await service.detail('7230', AbortSignal.timeout(2000));
    assert.equal(game.name, 'Portal');
    assert.equal(game.gameplayMainExtra, 5.5);
  } finally {
    HltbSearch.SEARCH_URL = oldSearch;
    HltbSearch.DETAIL_URL = oldDetail;
    await new Promise(resolve => http.close(resolve));
  }
});
