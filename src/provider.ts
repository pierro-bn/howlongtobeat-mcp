import { load } from 'cheerio';
import { HowLongToBeatEntry, HowLongToBeatService } from 'howlongtobeat';
import { z } from 'zod';
import { LookupError } from './errors.js';

const ORIGIN = 'https://howlongtobeat.com';
const SEARCH = `${ORIGIN}/api/search/site`;
// Keep one user agent for both initialization and search: the session is bound to it.
const HEADERS = { 'User-Agent': 'Mozilla/5.0', Origin: ORIGIN, Referer: `${ORIGIN}/` };
const duration = z.number().finite().nonnegative().nullish();
const recordSchema = z.object({
  game_id: z.number().int().positive(), game_name: z.string().trim().min(1),
  comp_main: duration, comp_plus: duration, comp_100: duration,
  profile_summary: z.string().nullish(), profile_platform: z.string().nullish(),
  game_image: z.string().nullish(),
});
const authSchema = z.object({ token: z.string().min(1), hpKey: z.string().optional(), hpVal: z.string().optional() });
type Auth = z.infer<typeof authSchema>;
type Fetch = typeof globalThis.fetch;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new LookupError('UPSTREAM_FORMAT_CHANGED', 'Unexpected HowLongToBeat data format.');
  return result.data;
}
function entry(value: unknown, query: string): HowLongToBeatEntry {
  const data = parse(recordSchema, value);
  const hours = (seconds: number | null | undefined) => seconds && seconds > 0 ? seconds / 3600 : 0;
  return new HowLongToBeatEntry(
    String(data.game_id), data.game_name, data.profile_summary ?? '',
    data.profile_platform?.split(',').map(p => p.trim()).filter(Boolean) ?? [],
    data.game_image ? `${ORIGIN}/games/${encodeURIComponent(data.game_image)}` : '',
    [['gameplayMain', 'Main Story'], ['gameplayMainExtra', 'Main + Extra'], ['gameplayCompletionist', 'Completionist']],
    hours(data.comp_main), hours(data.comp_plus), hours(data.comp_100),
    HowLongToBeatService.calcDistancePercentage(data.game_name, query), query,
  );
}

export class WebsiteProvider {
  private auth?: { value: Auth; expires: number };
  constructor(private fetcher: Fetch = globalThis.fetch) {}

  private async request(url: string, init: RequestInit): Promise<Response> {
    const response = await this.fetcher(url, { ...init, redirect: 'error', headers: { ...HEADERS, ...init.headers } });
    return response;
  }
  private async check(response: Response) {
    if (response.ok) return;
    const code = response.status === 403 ? 'UPSTREAM_FORBIDDEN'
      : response.status === 429 ? 'UPSTREAM_RATE_LIMITED'
      : response.status === 404 ? 'UPSTREAM_NOT_FOUND' : 'UPSTREAM_UNAVAILABLE';
    // Never echo response bodies: they may contain session information.
    await response.body?.cancel();
    throw new LookupError(code, `HowLongToBeat returned HTTP ${response.status}. No game data could be confirmed.`);
  }
  private async json(response: Response): Promise<unknown> {
    await this.check(response);
    try { return await response.json(); }
    catch (error) {
      if (error instanceof SyntaxError) throw new LookupError('UPSTREAM_FORMAT_CHANGED', 'HowLongToBeat returned invalid JSON.');
      throw error;
    }
  }
  private async session(signal?: AbortSignal): Promise<Auth> {
    if (this.auth && this.auth.expires > Date.now()) return this.auth.value;
    const response = await this.request(`${SEARCH}/init?t=${Date.now()}`, { signal });
    const value = parse(authSchema, await this.json(response));
    this.auth = { value, expires: Date.now() + 10 * 60_000 };
    return value;
  }

  async search(query: string, signal?: AbortSignal): Promise<HowLongToBeatEntry[]> {
    const body = JSON.stringify({
      searchType: 'games', searchTerms: query.split(/\s+/), searchPage: 1, size: 20,
      searchOptions: {
        games: { userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main',
          rangeTime: { min: 0, max: 0 }, rangeYear: { min: '', max: '' },
          gameplay: { perspective: '', flow: '', genre: '', difficulty: '' }, modifier: '' },
        users: { sortCategory: 'postcount' }, filter: '', sort: 0, randomizer: 0,
      }, useCache: true,
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const auth = await this.session(signal);
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-auth-token': auth.token };
      if (auth.hpKey !== undefined && auth.hpVal !== undefined) {
        headers['x-hp-key'] = auth.hpKey;
        headers['x-hp-val'] = auth.hpVal;
      }
      const response = await this.request(SEARCH, { method: 'POST', headers, body, signal });
      if (response.status === 401 || response.status === 403) {
        this.auth = undefined;
        if (attempt === 0) { await response.body?.cancel(); continue; }
      }
      const data = parse(z.object({ data: z.array(recordSchema) }), await this.json(response));
      return data.data.map(row => entry(row, query));
    }
    throw new LookupError('UPSTREAM_FORBIDDEN', 'HowLongToBeat rejected the renewed session.');
  }

  async detail(id: string, signal?: AbortSignal): Promise<HowLongToBeatEntry> {
    if (!/^[1-9]\d{0,9}$/.test(id)) throw new LookupError('INVALID_GAME_ID', 'Expected a numeric HowLongToBeat ID.');
    const response = await this.request(`${ORIGIN}/game/${id}`, { signal });
    await this.check(response);
    const $ = load(await response.text());
    let data: unknown;
    try { data = JSON.parse($('#__NEXT_DATA__').text()); }
    catch { throw new LookupError('UPSTREAM_FORMAT_CHANGED', 'Game page has no readable structured data.'); }
    // Read only the primary game record, never recommendations or related titles.
    const page = parse(z.object({ props: z.object({ pageProps: z.object({ game: z.object({
      data: z.object({ game: z.array(recordSchema).min(1) }),
    }) }) }) }), data);
    const game = page.props.pageProps.game.data.game.find(g => String(g.game_id) === id);
    if (!game) throw new LookupError('UPSTREAM_FORMAT_CHANGED', 'Game page did not contain the requested ID.');
    return entry(game, game.game_name);
  }
}
