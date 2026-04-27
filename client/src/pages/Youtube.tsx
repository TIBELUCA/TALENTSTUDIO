import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Youtube as YoutubeIcon, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type YouTubeVideo = {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  url: string;
};

type YouTubeResponse = {
  channel: { handle: string; title: string | null; url: string };
  videos: YouTubeVideo[];
  nextPageToken?: string;
  error?: { code: string; message: string };
};

const FALLBACK_CHANNEL_URL = "";
const PAGE_SIZE = 24;

export default function Youtube() {
  const [pages, setPages] = useState<YouTubeResponse[]>([]);
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [activeVideo, setActiveVideo] = useState<YouTubeVideo | null>(null);

  const { data, isLoading, isError, isFetching } = useQuery<YouTubeResponse>({
    queryKey: ["/api/youtube/latest-videos", { max: PAGE_SIZE, pageToken: pageToken ?? "" }],
    queryFn: async () => {
      const params = new URLSearchParams({ max: String(PAGE_SIZE) });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`/api/youtube/latest-videos?${params.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as YouTubeResponse | null;
      if (!res.ok || !json) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      setPages((prev) => {
        if (prev.find((p) => p === json)) return prev;
        return [...prev, json];
      });
      return json;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const allVideos = pages.flatMap((p) => p.videos);
  const channelUrl = data?.channel.url ?? FALLBACK_CHANNEL_URL;
  const channelTitle = data?.channel.title ?? "YouTube";
  const hasMore = !!data?.nextPageToken;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-red-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-16">
        <div className="mb-5 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Indietro
            </Button>
          </Link>
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 group"
            data-testid="link-youtube-channel"
          >
            <span className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm">
              <YoutubeIcon className="w-5 h-5" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-base sm:text-lg font-bold text-gray-800 group-hover:text-red-600 transition-colors">
                Canale YouTube
              </span>
              <span className="text-xs text-gray-500">{channelTitle}</span>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-red-600 transition-colors" />
          </a>
        </div>

        {isLoading && allVideos.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2" data-testid={`skeleton-youtube-video-${i}`}>
                <Skeleton className="w-full aspect-video rounded-lg" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : isError && allVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-gray-500" data-testid="status-youtube-error">
            <AlertCircle className="w-6 h-6 text-amber-500" />
            <p>Impossibile caricare gli ultimi video al momento.</p>
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-600 hover:underline font-medium"
              data-testid="link-youtube-fallback"
            >
              Apri il canale YouTube
            </a>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="grid-youtube-videos">
              {allVideos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => setActiveVideo(video)}
                  className="group flex flex-col gap-1.5 text-left"
                  data-testid={`button-youtube-video-${video.id}`}
                >
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-200 shadow-sm group-hover:shadow-md transition-shadow">
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        <YoutubeIcon className="w-8 h-8" />
                      </div>
                    )}
                    <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg transition-opacity">
                        <YoutubeIcon className="w-5 h-5" />
                      </span>
                    </span>
                  </div>
                  <p
                    className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2 group-hover:text-red-600 transition-colors"
                    data-testid={`text-youtube-video-title-${video.id}`}
                  >
                    {video.title}
                  </p>
                  {video.publishedAt && (
                    <p className="text-[10px] text-gray-500" data-testid={`text-youtube-video-date-${video.id}`}>
                      {format(new Date(video.publishedAt), "dd MMM yyyy")}
                    </p>
                  )}
                </button>
              ))}
            </div>
            <div className="flex justify-center mt-8">
              {hasMore ? (
                <Button
                  variant="outline"
                  onClick={() => setPageToken(data?.nextPageToken)}
                  disabled={isFetching}
                  data-testid="button-load-more"
                >
                  {isFetching ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Caricamento...</>
                  ) : (
                    "Carica altri video"
                  )}
                </Button>
              ) : (
                allVideos.length > 0 && (
                  <p className="text-xs text-gray-400" data-testid="text-no-more">Nessun altro video</p>
                )
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={!!activeVideo} onOpenChange={(open) => !open && setActiveVideo(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden" data-testid="dialog-youtube-player">
          {activeVideo && (
            <>
              <DialogHeader className="px-4 pt-4 pb-2">
                <DialogTitle className="text-base sm:text-lg pr-6 line-clamp-2" data-testid="text-player-title">
                  {activeVideo.title}
                </DialogTitle>
              </DialogHeader>
              <div className="relative w-full aspect-video bg-black">
                <iframe
                  key={activeVideo.id}
                  src={`https://www.youtube.com/embed/${activeVideo.id}?autoplay=1&rel=0`}
                  title={activeVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                  data-testid="iframe-youtube-player"
                />
              </div>
              <div className="px-4 py-3 flex items-center justify-between border-t bg-gray-50">
                <span className="text-xs text-gray-500">
                  {activeVideo.publishedAt ? format(new Date(activeVideo.publishedAt), "dd MMM yyyy") : ""}
                </span>
                <a
                  href={activeVideo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-red-600 hover:underline font-medium inline-flex items-center gap-1"
                  data-testid="link-open-on-youtube"
                >
                  Apri su YouTube <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
