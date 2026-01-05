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
 * Implementation based on direct API access and correct Ad/Intro handling logic
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
        return (
            window.location.hostname.includes("netflix.com") &&
            (window as any).netflix?.appContext?.state?.playerApp?.getAPI?.() !== undefined
        );
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

        const player = this.getPlayer();
        const duration = player ? player.getDuration() / 1000 : 0;

        const title = document.title?.trim() || "Netflix Video";

        return { contentId, title, duration };
    }



    /**
     * Finds the correct player session.
     * Priority:
     * 1. Session with valid duration (> 0)
     * 2. If multiple, heuristic based on duration/state could be added, 
     *    but usually there is one main "watch" session.
     */
    private getPlayer(): NetflixVideoPlayer | null {
        const api = this.getNetflixAPI();
        if (!api || !api.videoPlayer) return null;

        try {
            const sessionIds = api.videoPlayer.getAllPlayerSessionIds?.() || [];

            // Iterate all sessions to find the main one
            for (const id of sessionIds) {
                const p = api.videoPlayer.getVideoPlayerBySessionId(id);
                if (!p) continue;

                const durMs = p.getDuration();
                if (Number.isFinite(durMs) && durMs > 0) {
                    return p;
                }
            }
        } catch (e) {
            console.warn("[NetflixProvider] Error getting player session", e);
        }

        return null;
    }


    play(): void {
        const player = this.getPlayer();
        if (player) {
            player.play();
        }
    }


    pause(): void {
        const player = this.getPlayer();
        if (player) {
            player.pause();
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
        }
    }


    setPlaybackRate(rate: number): void {
        // Netflix API doesn't expose easy setPlaybackRate in the public/discovered methods easily.
        // We can try to set it on the video tag as a fallback using the robust inherited method.
        const video = this.getVideoElement();
        if (video) video.playbackRate = rate;
    }


    getTime(): number {
        const player = this.getPlayer();
        if (!player) return 0;

        // If ad is playing, return 0 or hold position to avoid syncing ads
        if (this.isAdPlaying()) {
            return 0;
        }

        // Preferred: getSegmentTime() which handles internal segmentation/buffer better
        const segTime = player.getSegmentTime();
        const rawTime = (typeof segTime === 'number') ? segTime : player.getCurrentTime();

        return rawTime / 1000;
    }


    getDuration(): number {
        const player = this.getPlayer();
        return player ? player.getDuration() / 1000 : 0;
    }


    isPaused(): boolean {
        const player = this.getPlayer();
        if (!player) return true;

        // If ad is playing, consider it "playing" locally, but for sync purposes 
        // we might want to mask it? For complexity, we just report true state.
        return player.isPaused();
    }


    isBuffering(): boolean {
        const player = this.getPlayer();
        return player ? (player.getBusy() === true) : false;
    }



    /**
     * Ad & Skip Handling
     */
    isAdPlaying(): boolean {
        // Netflix doesn't have traditional pre-rolls in all regions/tiers.
        // However, we can detect "Ad Breaks" if visible via UI classes or API.

        // Method 1: Check for "Ad" UI elements
        if (document.querySelector(".ad-interrupting")) {
            return true;
        }

        // Method 2: Check API "postPlay" or similar states if needed (omitted for simplicity unless verified)

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
        // Selectors for various "Skip" buttons on Netflix
        const selectors = [
            ".skip-credits > a",
            ".button-nfplayerSkipIntro",
            "[data-uia='player-skip-intro']",
            "[data-uia='player-skip-recap']",
            ".nf-flat-button.nf-flat-button-primary.nf-flat-button-uppercase" // generic fallback often used
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
