import { HowLongToBeatService, type HowLongToBeatEntry } from 'howlongtobeat';

export type Detail = 'compact' | 'detailed';
export interface Provider {
  search(query: string, signal?: AbortSignal): Promise<HowLongToBeatEntry[]>;
  detail(id: string, signal?: AbortSignal): Promise<HowLongToBeatEntry>;
}

export class LookupError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

// Upstream rounds search times to whole hours and represents missing times as 0.
// Do not turn these zeroes into claims that a game takes zero hours to complete.
function hours(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function normalize(entry: HowLongToBeatEntry, detail: Detail, fromSearch: boolean) {
  if (!entry || !/^\d+$/.test(entry.id) || !entry.name?.trim()) {
    throw new LookupError('UPSTREAM_FORMAT_CHANGED', 'HowLongToBeat returned an invalid game record.');
  }
  return {
    id: entry.id,
    name: entry.name,
    url: `https://howlongtobeat.com/game?id=${entry.id}`,
    times_hours: {
      main: hours(entry.gameplayMain),
      main_extra: hours(entry.gameplayMainExtra),
      completionist: hours(entry.gameplayCompletionist),
    },
    // Preserve labels: upstream may map Solo/Co-Op/Vs. to these three slots.
    time_labels: entry.timeLabels,
    ...(fromSearch ? { similarity: entry.similarity } : {}),
    ...(detail === 'detailed' ? {
      description: entry.description,
      platforms: entry.platforms,
      image_url: entry.imageUrl,
    } : {}),
  };
}

export class GameService {
  constructor(private provider: Provider = new HowLongToBeatService(), private timeoutMs = 25_000) {}

  private async run<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let onAbort: () => void = () => {};
    try {
      combined.throwIfAborted();
      return await Promise.race([
        operation(combined),
        new Promise<never>((_, reject) => {
          onAbort = () => reject(combined.reason);
          combined.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } catch (error) {
      if (signal?.aborted) throw new LookupError('CANCELLED', 'Request cancelled.');
      if (timeout.aborted) throw new LookupError('TIMEOUT', 'HowLongToBeat did not respond in time.');
      if (error instanceof LookupError) throw error;
      // Never expose upstream request objects, headers or HTML to the client.
      throw new LookupError('UPSTREAM_UNAVAILABLE', 'HowLongToBeat could not be read. The website may be unavailable, blocking requests, or have changed its format. This does not mean the game is absent.');
    } finally {
      combined.removeEventListener('abort', onAbort);
    }
  }

  async search(query: string, limit: number, detail: Detail, signal?: AbortSignal) {
    const entries = await this.run(s => this.provider.search(query, s), signal);
    if (!Array.isArray(entries)) throw new LookupError('UPSTREAM_FORMAT_CHANGED', 'Invalid search response.');
    const games = entries.slice(0, limit).map(e => normalize(e, detail, true));
    return {
      source: 'HowLongToBeat',
      fetched_at: new Date().toISOString(),
      query,
      status: games.length ? 'ok' : 'no_results',
      coverage: 'upstream_first_page_only',
      returned: games.length,
      available_in_page: entries.length,
      truncated: entries.length > limit,
      precision: 'upstream_search_rounded_hours',
      games,
    };
  }

  async get(id: string, detail: Detail, signal?: AbortSignal) {
    const entry = await this.run(s => this.provider.detail(id, s), signal);
    if (entry?.id !== id) throw new LookupError('UPSTREAM_FORMAT_CHANGED', 'Unexpected game ID in response.');
    return {
      source: 'HowLongToBeat', fetched_at: new Date().toISOString(),
      status: 'ok', precision: 'upstream_parsed_hours',
      game: normalize(entry, detail, false),
    };
  }
}
