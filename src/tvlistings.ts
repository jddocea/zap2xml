import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getConfig } from "./config.js";

const config = getConfig();

export interface Program {
  /** "title": "GMA3" */
  title: string;
  /** "id": "EP059182660025" */
  id: string;
  /** "tmsId": "EP059182660025" */
  tmsId: string;
  /** "shortDesc": "BIA performs; comic Zarna Garg; lifestyle contributor Lori Bergamotto; ABC News chief medical correspondent Dr. Tara Narula." */
  shortDesc: string;
  /** "season": "5" */
  season: string;
  /** "releaseYear": null */
  releaseYear: string | null;
  /** "episode": "217" */
  episode: string;
  /** "episodeTitle": null */
  episodeTitle: string | null;
  /** "seriesId": "SH05918266" */
  seriesId: string;
  /** "isGeneric": "0" */
  isGeneric: string;
}

export interface Event {
  /** "callSign": "KOMODT" */
  callSign: string;
  /** "duration": "60" */
  duration: string;
  /** "startTime": "2025-07-18T19:00:00Z" */
  startTime: string;
  /** "endTime": "2025-07-18T20:00:00Z" */
  endTime: string;
  /** "thumbnail": "p30687311_b_v13_aa" */
  thumbnail: string;
  /** "channelNo": "4.1" */
  channelNo: string;
  /** "filter": ["filter-news"] */
  filter: string[];
  /** "seriesId": "SH05918266" */
  seriesId: string;
  /** "rating": "TV-PG" */
  rating: string;
  /** "flag": ["New"] */
  flag: string[];
  /** "tags": ["Stereo", "CC"] */
  tags: string[];
  /** "program": {...} */
  program: Program;
  /** Series/show-level image asset id from overviewDetails, e.g. "p185044_b_h9_aa" (added by us, not in grid response) */
  seriesImage?: string;
}

export interface OverviewDetailsResponse {
  /** Show-level artwork asset id, e.g. "p185044_b_h9_aa" */
  seriesImage?: string;
  seriesDescription?: string;
  seriesGenres?: string;
}

export interface Channel {
  /** "callSign": "KOMODT" */
  callSign: string;
  /** "affiliateName": "AMERICAN BROADCASTING COMPANY" */
  affiliateName: string;
  /** "affiliateCallSign": "null" */
  affiliateCallSign: string | null;
  /** "channelId": "19629" */
  channelId: string;
  /** "channelNo": "4.1" */
  channelNo: string;
  /** "events": [...] */
  events: Event[];
  /** "id": "196290" */
  id: string;
  /** "stationGenres": [false] */
  stationGenres: boolean[];
  /** "stationFilters": ["filter-news", "filter-talk"] */
  stationFilters: string[];
  /** "thumbnail": "//zap2it.tmsimg.com/h3/NowShowing/19629/s28708_ll_h15_ac.png?w=55" */
  thumbnail: string;
}

export interface GridApiResponse {
  /** "channels": [...] */
  channels: Channel[];
}

function buildUrl(time: number, timespan: number): string {
  const params = {
    lineupId: config.lineupId,
    timespan: timespan.toString(),
    headendId: config.headendId,
    country: config.country,
    timezone: config.timezone,
    postalCode: config.postalCode,
    isOverride: "true",
    pref: config.pref + "16,128" || "16,128",
    aid: "orbebb",
    languagecode: "en-us",
    time: time.toString(),
    device: "X",
    userId: "-",
  };

  const urlParams = new URLSearchParams(params).toString();

  return `${config.baseUrl}?${urlParams}`;
}

export async function getTVListings(): Promise<GridApiResponse> {
  console.log("Fetching TV listings");

  const totalHours = parseInt(config.timespan, 10);
  const chunkHours = 6; // Gracenote allows up to 6 hours per request
  const now = Math.floor(Date.now() / 1000); // Current time in UNIX timestamp
  const channelsMap: Map<string, Channel> = new Map();

  for (let offset = 0; offset < totalHours; offset += chunkHours) {
    const time = now + offset * 3600;
    const url = buildUrl(time, chunkHours);

    // Sequential (not parallel) so long TIMESPANs don't burst dozens of requests at once.
    const response = await fetchWithRetry(url, {
      headers: {
        "User-Agent": config.userAgent || "",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch: ${response.status} ${response.statusText}`,
      );
    }
    const chunkData = (await response.json()) as GridApiResponse;

    for (const newChannel of chunkData.channels) {
      if (!channelsMap.has(newChannel.channelId)) {
        // Clone channel with its events
        channelsMap.set(newChannel.channelId, {
          ...newChannel,
          events: [...newChannel.events],
        });
      } else {
        const existingChannel = channelsMap.get(newChannel.channelId)!;
        existingChannel.events.push(...newChannel.events);
      }
    }
  }

  const channels = Array.from(channelsMap.values());
  await attachSeriesImages(channels);

  return { channels };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch() that waits and retries on 429/503, honoring Retry-After when present. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  tries = 4,
): Promise<Response> {
  let wait = 30_000;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, init);
    if ((response.status !== 429 && response.status !== 503) || attempt >= tries) {
      return response;
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = retryAfter > 0 ? retryAfter * 1000 : wait;
    console.log(
      `Got ${response.status} from Gracenote, waiting ${Math.round(delay / 1000)}s before retry ${attempt}/${tries - 1}`,
    );
    await sleep(delay);
    wait *= 2;
  }
}

class RateLimitedError extends Error {}

/**
 * POST https://tvlistings.gracenote.com/api/program/overviewDetails
 * The call the Gracenote "program overview" page makes. Keyed by series id
 * (SH/MV/SP...), so one request covers every episode of a show.
 */
export async function getOverviewDetails(
  seriesId: string,
): Promise<OverviewDetailsResponse | null> {
  const body = new URLSearchParams({
    programSeriesID: seriesId,
    "clickstream[FromPage]": "TV Grid",
    postalCode: config.postalCode,
    countryCode: config.country,
    headendId: config.headendId,
    timezone: config.timezone,
    aid: "orbebb",
    languagecode: "en-us",
    device: "X",
    userId: "-",
  });

  const response = await fetch(
    "https://tvlistings.gracenote.com/api/program/overviewDetails",
    {
      method: "POST",
      headers: {
        "User-Agent": config.userAgent || "",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        // Without Origin/Referer from the affiliate grid page, Gracenote returns 403.
        Origin: "https://tvlistings.gracenote.com",
        Referer:
          "https://tvlistings.gracenote.com/grid-affiliates.html?aid=orbebb",
      },
      body,
    },
  );
  if (response.status === 429) throw new RateLimitedError();
  if (!response.ok) return null;
  return (await response.json()) as OverviewDetailsResponse;
}

interface CacheEntry {
  /** asset id, or "" if the show has no series image */
  image: string;
  /** ms since epoch */
  fetched: number;
}

function cachePath(): string {
  return (
    process.env["SERIES_CACHE"] ||
    join(dirname(config.outputFile), "series-images.json")
  );
}

function loadCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(readFileSync(cachePath(), "utf-8"));
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CacheEntry>): void {
  try {
    writeFileSync(cachePath(), JSON.stringify(cache));
  } catch (err) {
    console.warn("Could not write series image cache:", err);
  }
}

async function attachSeriesImages(channels: Channel[]): Promise<void> {
  if (process.env["SERIES_IMAGES"] === "false") return;

  const ttlMs = Number(process.env["SERIES_CACHE_DAYS"] || "14") * 86_400_000;
  const delayMs = Number(process.env["SERIES_DELAY_MS"] || "1500");
  const maxPerRun = Number(process.env["SERIES_MAX_PER_RUN"] || "150");

  const seriesIds = new Set<string>();
  for (const channel of channels) {
    for (const event of channel.events) {
      const id = event.seriesId || event.program?.seriesId;
      if (id) seriesIds.add(id);
    }
  }

  const cache = loadCache();
  const now = Date.now();
  const missing = [...seriesIds].filter(
    (id) => !cache[id] || now - cache[id].fetched > ttlMs,
  );
  const toFetch = missing.slice(0, maxPerRun);

  console.log(
    `Series images: ${seriesIds.size} shows, ${seriesIds.size - missing.length} cached, fetching ${toFetch.length}` +
      (missing.length > toFetch.length
        ? ` (${missing.length - toFetch.length} left for later runs)`
        : ""),
  );

  for (const [i, id] of toFetch.entries()) {
    if (i > 0) await sleep(delayMs);
    try {
      const details = await getOverviewDetails(id);
      if (details) cache[id] = { image: details.seriesImage || "", fetched: now };
    } catch (err) {
      if (err instanceof RateLimitedError) {
        console.log(
          "Rate limited on series images; stopping for this run (episode images used for the rest)",
        );
        break;
      }
      // network error: skip this show, try again next run
    }
  }

  saveCache(cache);

  for (const channel of channels) {
    for (const event of channel.events) {
      const id = event.seriesId || event.program?.seriesId;
      const img = id ? cache[id]?.image : undefined;
      if (img) event.seriesImage = img;
    }
  }
}
