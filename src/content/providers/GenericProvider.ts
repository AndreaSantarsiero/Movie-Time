import { AbstractVideoProvider } from "./AbstractVideoProvider";



/**
 * Generic Provider
 * Fallback for any site with a <video> tag
 */
export class GenericProvider extends AbstractVideoProvider {

    private cachedVideo: HTMLVideoElement | null = null;
    private cacheTime: number = 0;

    get name(): string {
        return "generic";
    }

    isApplicable(): boolean {
        return document.querySelectorAll("video").length > 0;
    }



    getVideoElement(): HTMLVideoElement | null {
        // Cache the best video for 2 seconds to avoid running heavy scoring every frame
        const now = Date.now();
        if (this.cachedVideo && this.cachedVideo.isConnected && (now - this.cacheTime < 2000)) {
            return this.cachedVideo;
        }

        const videos = Array.from(document.querySelectorAll("video"));
        if (videos.length === 0) return null;
        if (videos.length === 1) {
            this.updateCache(videos[0]);
            return videos[0];
        }

        // Scoring system to find the "Main" video
        let bestVideo: HTMLVideoElement | null = null;
        let bestScore = -1;

        for (const v of videos) {
            if (!v.isConnected) continue;
            // Must have a source or be streaming
            if (!v.src && !v.currentSrc && v.readyState === 0) continue;

            let score = 0;

            // 1. Dimensions (Max 50)
            const viewportArea = window.innerWidth * window.innerHeight;
            const rect = v.getBoundingClientRect();
            const videoArea = rect.width * rect.height;
            if (videoArea > 0 && viewportArea > 0) {
                const coverage = videoArea / viewportArea;
                score += Math.min(50, coverage * 100);
            }

            // 2. Duration (Max 30)
            const dur = v.duration;
            if (Number.isFinite(dur) && dur > 0) {
                if (dur > 600) score += 30;
                else if (dur > 120) score += 15;
                else if (dur > 30) score += 5;
            }

            // 3. Audio (Max 10)
            if (!v.muted && v.volume > 0) score += 10;

            // 4. Activity (Max 10)
            if (!v.paused) score += 10;

            if (score > bestScore) {
                bestScore = score;
                bestVideo = v;
            }
        }

        this.updateCache(bestVideo);
        return bestVideo;
    }


    private updateCache(video: HTMLVideoElement | null) {
        this.cachedVideo = video;
        this.cacheTime = Date.now();
    }


    getContentInfo() {
        const video = this.getVideoElement();
        const duration = video && Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : null;

        const title = document.title?.trim() || "Unknown Video";

        // Remove query params for stable ID
        const contentId = location.origin + location.pathname;

        return { contentId, title, duration };
    }
}
