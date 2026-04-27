import { useQuery } from "@tanstack/react-query";
import { Youtube, ExternalLink, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  error?: { code: string; message: string };
};

class YouTubeFetchError extends Error {}

interface YouTubeChannelWidgetProps {
  className?: string;
  maxVideos?: number;
}

const FALLBACK_CHANNEL_URL = "";

export function YouTubeChannelWidget({ className, maxVideos = 6 }: YouTubeChannelWidgetProps) {
  const { data, isLoading, isError } = useQuery<YouTubeResponse>({
    queryKey: ["/api/youtube/latest-videos", { max: maxVideos }],
    queryFn: async () => {
      const res = await fetch(`/api/youtube/latest-videos?max=${maxVideos}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as YouTubeResponse | null;
      if (!res.ok) {
        throw new YouTubeFetchError(json?.error?.message ?? `HTTP ${res.status}`);
      }
      if (!json) {
        throw new YouTubeFetchError("Empty response");
      }
      return json;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const channelUrl = data?.channel.url ?? FALLBACK_CHANNEL_URL;
  const channelTitle = data?.channel.title ?? "YouTube";

  return (
    <div
      className={cn(
        "w-full backdrop-blur-md bg-white/40 border border-white/50 rounded-2xl shadow-lg overflow-hidden",
        className,
      )}
      data-testid="widget-youtube-channel"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/40">
        <a
          href={channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 group"
          data-testid="link-youtube-channel"
        >
          <span className="w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm">
            <Youtube className="w-4 h-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-gray-800 group-hover:text-red-600 transition-colors">
              Canale YouTube
            </span>
            <span className="text-[11px] text-gray-500">{channelTitle}</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-red-600 transition-colors" />
        </a>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: maxVideos }).map((_, i) => (
              <div key={i} className="space-y-2" data-testid={`skeleton-youtube-video-${i}`}>
                <Skeleton className="w-full aspect-video rounded-lg" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : isError || !data?.videos?.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-sm text-gray-500" data-testid="status-youtube-error">
            <AlertCircle className="w-5 h-5 text-amber-500" />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.videos.slice(0, maxVideos).map((video) => (
              <a
                key={video.id}
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-1.5"
                data-testid={`link-youtube-video-${video.id}`}
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
                      <Youtube className="w-8 h-8" />
                    </div>
                  )}
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg transition-opacity">
                      <Youtube className="w-4 h-4" />
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
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default YouTubeChannelWidget;
