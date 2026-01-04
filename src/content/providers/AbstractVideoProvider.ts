/**
 * Abstract implementation with default methods
 */
export abstract class AbstractVideoProvider {

    private cachedVideo: HTMLVideoElement | null = null;
    private cacheTime: number = 0;

    constructor() { }


    /**
     * Uniquely identifies the provider type
     */
    abstract get name(): string;


    /**
     * Determines if this provider can handle the current page
     */
    abstract isApplicable(): boolean;


    /**
     * Returns metadata about the current media
     * - contentId: Used for room matching (must be consistent across peers)
     * - title: Displayed in the UI
     * - duration: Used for sync validation
     */
    abstract getContentInfo(): {
        contentId: string | null;
        title: string | null;
        duration: number | null;
    };



    /** 
     * Returns the underlying video element if available
     */
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



    /**
     * Default playback controls (can be overridden)
     */
    play(): void {
        const video = this.getVideoElement();
        if (video) video.play().catch(e => console.warn(`[${this.name}] Play failed`, e));
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



    /**
     * Default state retrieval (can be overridden)
     */
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


    isBuffering(): boolean {
        const video = this.getVideoElement();
        // readyState < 3 usually means it doesn't have enough data for current + future frame
        // HAVE_CURRENT_DATA (2) or less is buffering/loading
        return video ? video.readyState < 3 : false;
    }
}
