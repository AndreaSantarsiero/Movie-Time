import { AbstractVideoProvider } from "./AbstractVideoProvider";



// YouTube Player API interface
interface YouTubePlayerAPI extends HTMLElement {
    getCurrentTime(): number;
    getDuration(): number;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    getPlayerState(): number;   // 1 = playing, 2 = paused, 3 = buffering
    getVideoData(): { video_id: string; title: string };
    getAdState(): number;   // 1 = ad playing
}



export class YouTubeProvider extends AbstractVideoProvider {

    get name(): string {
        return "youtube";
    }


    isApplicable(): boolean {
        return window.location.hostname.includes("youtube.com") && !!this.getPlayer();
    }


    getContentInfo() {
        const player = this.getPlayer();
        if (!player) {
            return { contentId: null, title: "YouTube", duration: 0 };
        }

        try {
            const data = player.getVideoData();
            const contentId = data?.video_id || null;
            const title = data?.title || document.title;
            const duration = player.getDuration();
            return { contentId, title, duration };
        } catch (e) {
            return { contentId: null, title: "YouTube", duration: 0 };
        }
    }


    private getPlayer(): YouTubePlayerAPI | null {
        return document.getElementById("movie_player") as unknown as YouTubePlayerAPI;
    }


    play(): void {
        const player = this.getPlayer();
        if (player) player.playVideo();
    }


    pause(): void {
        const player = this.getPlayer();
        if (player) player.pauseVideo();
    }


    seek(timeSec: number): void {
        const player = this.getPlayer();
        if (player) {
            if (this.isAdPlaying()) return;
            player.seekTo(timeSec, true);
        }
    }


    setPlaybackRate(rate: number): void {
        // Fallback to DOM element
        const video = this.getVideoElement();
        if (video) video.playbackRate = rate;
    }


    getTime(): number {
        const player = this.getPlayer();
        if (!player || this.isAdPlaying()) return 0;
        return player.getCurrentTime();
    }


    getDuration(): number {
        const player = this.getPlayer();
        return player ? player.getDuration() : 0;
    }


    isPaused(): boolean {
        const player = this.getPlayer();
        if (!player) return true;

        const state = player.getPlayerState();
        // 1=Playing, 3=Buffering (treat buffering as playing or separate? For now 2=Paused)
        return state !== 1 && state !== 3;
    }


    isBuffering(): boolean {
        const player = this.getPlayer();
        // State 3 is Buffering
        return player ? player.getPlayerState() === 3 : false;
    }


    private isAdPlaying(): boolean {
        const player = this.getPlayer();
        if (!player) return false;

        // API Check
        try {
            if (typeof player.getAdState === 'function' && player.getAdState() === 1) {
                return true;
            }
        } catch (e) { }

        // DOM Check
        if (document.querySelector(".ad-interrupting")) {
            return true;
        }

        return false;
    }
}
