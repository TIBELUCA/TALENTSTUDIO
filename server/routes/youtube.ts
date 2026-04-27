import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requireAnyAuth } from "../middlewares/auth";
import { getLatestChannelVideos, getYouTubeChannelInfo, YouTubeError } from "../services/youtube";

const router = Router();

router.get("/api/youtube/latest-videos", requireAnyAuth, asyncHandler(async (req, res) => {
  const maxRaw = parseInt(String(req.query.max ?? "6"), 10);
  const max = Number.isFinite(maxRaw) ? Math.min(Math.max(maxRaw, 1), 50) : 6;
  const pageToken = typeof req.query.pageToken === "string" && req.query.pageToken ? req.query.pageToken : undefined;
  try {
    const data = await getLatestChannelVideos(max, pageToken);
    res.json(data);
  } catch (err) {
    if (err instanceof YouTubeError) {
      const channel = getYouTubeChannelInfo();
      res.status(err.status).json({
        error: { code: err.code, message: err.message },
        channel: { handle: channel.handle, title: null, url: channel.url },
        videos: [],
      });
      return;
    }
    throw err;
  }
}));

export default router;
