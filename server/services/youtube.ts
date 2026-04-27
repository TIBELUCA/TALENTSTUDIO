const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const CHANNEL_HANDLE = process.env.YOUTUBE_CHANNEL_HANDLE?.trim() || "";
const CHANNEL_URL = CHANNEL_HANDLE ? `https://www.youtube.com/@${CHANNEL_HANDLE}/videos` : "";
const CACHE_TTL_MS = 10 * 60 * 1000;

export type YouTubeVideo = {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  url: string;
};

export type YouTubeLatestResult = {
  channel: {
    handle: string;
    title: string | null;
    url: string;
  };
  videos: YouTubeVideo[];
  nextPageToken?: string;
};

type CacheEntry = {
  expiresAt: number;
  data: YouTubeLatestResult;
};

type ResolvedChannel = {
  id: string;
  title: string | null;
  uploadsPlaylistId: string;
};

type YouTubeThumbnail = { url: string; width?: number; height?: number };

type YouTubeChannelItem = {
  id: string;
  snippet?: { title?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

type YouTubePlaylistItem = {
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
  snippet?: {
    title?: string;
    publishedAt?: string;
    resourceId?: { videoId?: string };
    thumbnails?: {
      maxres?: YouTubeThumbnail;
      standard?: YouTubeThumbnail;
      high?: YouTubeThumbnail;
      medium?: YouTubeThumbnail;
      default?: YouTubeThumbnail;
    };
  };
};

type YouTubeApiErrorBody = {
  error?: {
    message?: string;
    errors?: { reason?: string }[];
  };
};

const cache = new Map<string, CacheEntry>();
let cachedChannel: ResolvedChannel | null = null;

class YouTubeError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function ytFetch<T>(path: string, params: Record<string, string>, apiKey: string): Promise<T> {
  const search = new URLSearchParams({ ...params, key: apiKey }).toString();
  const res = await fetch(`${YOUTUBE_API_BASE}/${path}?${search}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let parsed: YouTubeApiErrorBody | null = null;
    try { parsed = JSON.parse(body) as YouTubeApiErrorBody; } catch { /* ignore */ }
    const reason = parsed?.error?.errors?.[0]?.reason ?? "";
    if (res.status === 403 && (reason === "quotaExceeded" || reason === "rateLimitExceeded")) {
      throw new YouTubeError("quota_exceeded", "YouTube API quota exceeded", 503);
    }
    if (res.status === 400 || res.status === 403) {
      throw new YouTubeError("api_error", `YouTube API error (${res.status}): ${parsed?.error?.message ?? body}`, 502);
    }
    throw new YouTubeError("api_error", `YouTube API error (${res.status})`, 502);
  }
  return res.json() as Promise<T>;
}

async function resolveChannel(apiKey: string): Promise<ResolvedChannel> {
  if (cachedChannel) return cachedChannel;
  const data = await ytFetch<{ items?: YouTubeChannelItem[] }>("channels", {
    part: "contentDetails,snippet",
    forHandle: `@${CHANNEL_HANDLE}`,
    maxResults: "1",
  }, apiKey);
  const item = data.items?.[0];
  if (!item) {
    throw new YouTubeError("channel_not_found", `YouTube channel @${CHANNEL_HANDLE} not found`, 404);
  }
  const uploads = item.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) {
    throw new YouTubeError("uploads_not_found", "Uploads playlist not found for channel", 502);
  }
  const resolved: ResolvedChannel = {
    id: item.id,
    title: item.snippet?.title ?? null,
    uploadsPlaylistId: uploads,
  };
  cachedChannel = resolved;
  return resolved;
}

export async function getLatestChannelVideos(maxResults = 6, pageToken?: string): Promise<YouTubeLatestResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new YouTubeError("missing_api_key", "YOUTUBE_API_KEY environment variable is not configured", 503);
  }

  const cacheKey = `latest:${maxResults}:${pageToken ?? ""}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const channel = await resolveChannel(apiKey);
  const params: Record<string, string> = {
    part: "snippet,contentDetails",
    playlistId: channel.uploadsPlaylistId,
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
  };
  if (pageToken) params.pageToken = pageToken;
  const playlistData = await ytFetch<{ items?: YouTubePlaylistItem[]; nextPageToken?: string }>("playlistItems", params, apiKey);

  const videos: YouTubeVideo[] = (playlistData.items ?? [])
    .map((item): YouTubeVideo | null => {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      if (!videoId) return null;
      const thumbs = item.snippet?.thumbnails ?? {};
      const thumb =
        thumbs.maxres ?? thumbs.standard ?? thumbs.high ?? thumbs.medium ?? thumbs.default;
      return {
        id: videoId,
        title: item.snippet?.title ?? "",
        publishedAt: item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt ?? "",
        thumbnailUrl: thumb?.url ?? "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    })
    .filter((v): v is YouTubeVideo => v !== null);

  const result: YouTubeLatestResult = {
    channel: {
      handle: CHANNEL_HANDLE,
      title: channel.title,
      url: CHANNEL_URL,
    },
    videos,
    nextPageToken: playlistData.nextPageToken,
  };

  cache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, data: result });
  return result;
}

export function getYouTubeChannelInfo() {
  return { handle: CHANNEL_HANDLE, url: CHANNEL_URL };
}

export { YouTubeError };
