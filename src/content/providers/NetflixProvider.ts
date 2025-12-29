import { VideoProvider } from "./VideoProvider";



/**
 * Netflix Provider
 */
export class NetflixProvider implements VideoProvider {

    get name(): string {
        return "netflix";
    }

    isApplicable(): boolean {
        return (
            window.location.hostname.includes("netflix.com") &&
            (window as any).netflix?.appContext?.state?.playerApp?.getAPI?.() !== undefined
        );
    }

    private getNetflixAPI() {
        return (window as any).netflix?.appContext?.state?.playerApp?.getAPI?.();
    }



    /*
     * Attempts to find the Netflix player session that matches the duration of the visible video element
     */
    private getPlayer() {
        const video = this.getVideoElement();
        if (!video) return null;

        const api = this.getNetflixAPI();
        if (!api || !api.videoPlayer) return null;

        const sessionIds = api.videoPlayer.getAllPlayerSessionIds?.() || [];

        // Iterate all sessions to find one matching the target video duration
        for (const id of sessionIds) {
            const p = api.videoPlayer.getVideoPlayerBySessionId(id);
            if (!p) continue;

            const durMs = p.getDuration();
            if (!Number.isFinite(durMs)) continue;

            // Check if durations match (within 2s tolerance to be safe)
            if (Math.abs(durMs - video.duration * 1000) < 2000) {
                return p;
            }
        }

        return null;
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
        // Netflix: /watch/<id>
        const match = location.pathname.match(/\/watch\/(\d+)/);
        const contentId = match?.[1] ?? null;

        const video = this.getVideoElement();
        const duration =
            video && Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : null;

        const title = document.title?.trim() || "Netflix Video";

        return { contentId, title, duration };
    }


    play(): void {
        const player = this.getPlayer();
        if (player) {
            player.play();
        } else {
            // Fallback to video element
            this.getVideoElement()?.play();
        }
    }


    pause(): void {
        const player = this.getPlayer();
        if (player) {
            player.pause();
        } else {
            this.getVideoElement()?.pause();
        }
    }


    seek(timeSec: number): void {
        const player = this.getPlayer();
        if (player) {
            player.seek(timeSec * 1000);
        } else {
            const video = this.getVideoElement();
            if (video) video.currentTime = timeSec;
        }
    }


    setPlaybackRate(rate: number): void {
        // Netflix might not support API rate change easily, fallback to video element which usually works
        const video = this.getVideoElement();
        if (video) video.playbackRate = rate;
    }


    getTime(): number {
        const player = this.getPlayer();
        if (player) {
            return player.getCurrentTime() / 1000;
        }
        const video = this.getVideoElement();
        return video ? video.currentTime : 0;
    }


    getDuration(): number {
        const player = this.getPlayer();
        if (player) {
            return player.getDuration() / 1000;
        }
        const video = this.getVideoElement();
        return video ? video.duration : 0;
    }


    isPaused(): boolean {
        const player = this.getPlayer();
        if (player) {
            return player.isPaused();
        }
        const video = this.getVideoElement();
        return video ? video.paused : true;
    }
}
