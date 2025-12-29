import { VideoProvider } from "./VideoProvider";



/**
 * Generic Provider
 */
export class GenericProvider implements VideoProvider {

    get name(): string {
        return "generic";
    }

    isApplicable(): boolean {
        return document.querySelectorAll("video").length > 0;
    }



    getVideoElement(): HTMLVideoElement | null {
        const videos = Array.from(document.querySelectorAll("video"));
        if (videos.length === 0) return null;
        if (videos.length === 1) return videos[0];

        // Scoring system to find the "Main" video
        let bestVideo: HTMLVideoElement | null = null;
        let bestScore = -1;

        for (const v of videos) {
            if (!v.isConnected) continue;
            // Must have a source
            if (!v.src && !v.currentSrc) continue;

            let score = 0;

            // 1. Dimensions (Max 50)
            // Area relative to viewport
            const viewportArea = window.innerWidth * window.innerHeight;
            const rect = v.getBoundingClientRect();
            const videoArea = rect.width * rect.height;
            if (videoArea > 0 && viewportArea > 0) {
                const coverage = videoArea / viewportArea;
                // Cap at 50pts for > 50% coverage
                score += Math.min(50, coverage * 100);
            }

            // 2. Duration (Max 30)
            // Prefer long videos (movies) over short ones (trailers/previews)
            const dur = v.duration;
            if (isFinite(dur) && dur > 0) {
                if (dur > 600) score += 30;
                else if (dur > 120) score += 15;
                else if (dur > 30) score += 5;
            }

            // 3. Audio (Max 10)
            // Unmuted usually means user intent
            if (!v.muted && v.volume > 0) {
                score += 10;
            }

            // 4. Activity (Max 10)
            // Playing videos are more likely to be the main content
            if (!v.paused) {
                score += 10;
            }

            if (score > bestScore) {
                bestScore = score;
                bestVideo = v;
            }
        }

        return bestVideo;
    }



    getContentInfo() {
        const video = this.getVideoElement();
        const duration =
            video && Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : null;

        // Use page title as fallback using standard document.title
        const title = document.title?.trim() || "Unknown Video";

        // For generic sites, we use the URL or a hash of the URL as ID
        // We strip query params to be safer, or keep them if they matter. for now: URL no query
        const contentId = location.origin + location.pathname;

        return { contentId, title, duration };
    }


    play(): void {
        const video = this.getVideoElement();
        if (video) video.play().catch((e) => console.warn("[GenericProvider] Play failed", e));
    }


    pause(): void {
        const video = this.getVideoElement();
        if (video) video.pause();
    }


    seek(timeSec: number): void {
        const video = this.getVideoElement();
        if (video) video.currentTime = timeSec;
    }


    setPlaybackRate(rate: number): void {
        const video = this.getVideoElement();
        if (video) video.playbackRate = rate;
    }


    getTime(): number {
        const video = this.getVideoElement();
        return video ? video.currentTime : 0;
    }


    getDuration(): number {
        const video = this.getVideoElement();
        return video ? video.duration : 0;
    }


    isPaused(): boolean {
        const video = this.getVideoElement();
        return video ? video.paused : true;
    }
}
