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

  console.log(urlParams)

  return `${config.baseUrl}?${urlParams}`;
}

export async function getTVListings(): Promise<GridApiResponse> {
  console.log("Fetching TV listings");

  const totalHours = parseInt(config.timespan, 10);
  const chunkHours = 6; // Gracenote allows up to 6 hours per request
  const now = Math.floor(Date.now() / 1000); // Current time in UNIX timestamp
  const channelsMap: Map<string, Channel> = new Map();

  const fetchPromises: Promise<void>[] = [];

  for (let offset = 0; offset < totalHours; offset += chunkHours) {
    const time = now + offset * 3600;
    const url = buildUrl(time, chunkHours);

    const fetchPromise = fetch(url, {
      headers: {
        "User-Agent": config.userAgent || "",
      },
    }).then(async (response) => {
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
    });

    fetchPromises.push(fetchPromise);
  }

  await Promise.all(fetchPromises);

  const channels = Array.from(channelsMap.values());
  await attachSeriesImages(channels);

  return { channels };
}

/**
 * POST https://tvlistings.gracenote.com/api/program/overviewDetails
 * This is the call the tvlistings.gracenote.com "program overview" popup makes.
 * It is keyed by series id (SH/MV/SP...), so one request covers every episode of a show.
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

  try {
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
    if (!response.ok) return null;
    return (await response.json()) as OverviewDetailsResponse;
  } catch {
    return null;
  }
}

async function attachSeriesImages(channels: Channel[]): Promise<void> {
  if (process.env["SERIES_IMAGES"] === "false") return;

  const seriesIds = new Set<string>();
  for (const channel of channels) {
    for (const event of channel.events) {
      const id = event.seriesId || event.program?.seriesId;
      if (id) seriesIds.add(id);
    }
  }

  console.log(`Fetching series images for ${seriesIds.size} shows`);

  const images = new Map<string, string>();
  const queue = [...seriesIds];
  const concurrency = 5; // keep it polite; one request per unique show
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const details = await getOverviewDetails(id);
        if (details?.seriesImage) images.set(id, details.seriesImage);
      }
    }),
  );

  for (const channel of channels) {
    for (const event of channel.events) {
      const id = event.seriesId || event.program?.seriesId;
      const img = id ? images.get(id) : undefined;
      if (img) event.seriesImage = img;
    }
  }
}
