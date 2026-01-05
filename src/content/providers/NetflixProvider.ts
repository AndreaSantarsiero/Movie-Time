import { AbstractVideoProvider } from "./AbstractVideoProvider";



// Define the Netflix API types we expect
interface NetflixPlayerAPI {
    videoPlayer: {
        getAllPlayerSessionIds: () => string[];
        getVideoPlayerBySessionId: (id: string) => NetflixVideoPlayer;
    }
}


interface NetflixVideoPlayer {
    getDuration: () => number;
    getCurrentTime: () => number;    // returns ms
    getSegmentTime: () => number | null; // returns ms or null
    play: () => void;
    pause: () => void;
    seek: (timeMs: number) => void;
    isPaused: () => boolean;
    getBusy: () => boolean; // often indicates buffering
}



/**
 * Netflix Provider
 * Hybrid Implementation: Uses Netflix API matched with DOM Video Element
 */
export class NetflixProvider extends AbstractVideoProvider {

    private skipObserver: MutationObserver | null = null;

    constructor() {
        super();
        this.initSkipObserver();
    }


    get name(): string {
        return "netflix";
    }


    isApplicable(): boolean {
        return window.location.hostname.includes("netflix.com");
    }


    private getNetflixAPI(): NetflixPlayerAPI | null {
        try {
            return (window as any).netflix?.appContext?.state?.playerApp?.getAPI?.() || null;
        } catch (e) {
            return null;
        }
    }


    getContentInfo() {
        // Netflix URL format: /watch/<id>
        const match = location.pathname.match(/\/watch\/(\d+)/);
        const contentId = match?.[1] ?? null;

        // Prefer DOM duration as it drives the matching
        const video = this.getVideoElement();
        const duration = video && Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : null;

        const title = document.title?.trim() || "Netflix Video";

        return { contentId, title, duration };
    }



    /**
     * Attempts to find the Netflix player session that matches the duration of the visible video element
     */
    private getPlayer(): NetflixVideoPlayer | null {
        // 1. Get the robustly scored DOM video
        const video = this.getVideoElement();
        if (!video) return null;

        // 2. Get API
        const api = this.getNetflixAPI();
        if (!api || !api.videoPlayer) return null;

        try {
            const sessionIds = api.videoPlayer.getAllPlayerSessionIds?.() || [];

            // 3. Iterate all sessions to find one matching the target video duration
            for (const id of sessionIds) {
                const p = api.videoPlayer.getVideoPlayerBySessionId(id);
                if (!p) continue;

                const durMs = p.getDuration();
                if (!Number.isFinite(durMs)) continue;

                // Check if durations match (within 2s tolerance)
                if (Math.abs(durMs - video.duration * 1000) < 2000) {
                    return p;
                }
            }
        } catch (e) {
            console.warn("[NetflixProvider] Error getting matching player session", e);
        }

        return null;
    }


    play(): void {
        const player = this.getPlayer();
        if (player) {
            player.play();
        } else {
            // Fallback
            super.play();
        }
    }


    pause(): void {
        const player = this.getPlayer();
        if (player) {
            player.pause();
        } else {
            super.pause();
        }
    }


    seek(timeSec: number): void {
        const player = this.getPlayer();
        if (player) {
            // Check for ads before seeking
            if (this.isAdPlaying()) {
                console.log("[NetflixProvider] Ad playing, ignoring seek");
                return;
            }
            player.seek(timeSec * 1000);
        } else {
            super.seek(timeSec);
        }
    }


    setPlaybackRate(rate: number): void {
        // Netflix API fallback to DOM
        super.setPlaybackRate(rate);
    }


    getTime(): number {
        const player = this.getPlayer();
        if (player) {
            const segTime = player.getSegmentTime();
            const rawTime = (typeof segTime === 'number') ? segTime : player.getCurrentTime();
            return rawTime / 1000;
        }
        return super.getTime();
    }


    getDuration(): number {
        const player = this.getPlayer();
        if (player) {
            return player.getDuration() / 1000;
        }
        return super.getDuration();
    }


    isPaused(): boolean {
        const player = this.getPlayer();
        if (player) {
            return player.isPaused();
        }
        return super.isPaused();
    }


    isBuffering(): boolean {
        const player = this.getPlayer();
        if (player) {
            return player.getBusy() === true;
        }
        return super.isBuffering();
    }



    /**
     * Ad & Skip Handling
     */
    isAdPlaying(): boolean {
        // Keep checking for Ad UI elements
        if (document.querySelector(".ad-interrupting")) {
            return true;
        }
        return false;
    }


    private initSkipObserver() {
        if (this.skipObserver) return;

        this.skipObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    this.trySkipButtons();
                }
            }
        });

        this.skipObserver.observe(document.body, { childList: true, subtree: true });
    }


    private trySkipButtons() {
        const selectors = [
            ".skip-credits > a",
            ".button-nfplayerSkipIntro",
            "[data-uia='player-skip-intro']",
            "[data-uia='player-skip-recap']",
            ".nf-flat-button.nf-flat-button-primary.nf-flat-button-uppercase"
        ];

        for (const sel of selectors) {
            const btn = document.querySelector(sel);
            if (btn instanceof HTMLElement) {
                console.log("[NetflixProvider] Clicking skip button:", sel);
                btn.click();
            }
        }
    }
}
