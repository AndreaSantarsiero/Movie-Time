import { VideoProvider } from "./VideoProvider";



/**
 * Abstract implementation of VideoProvider with default methods
 */
export abstract class AbstractVideoProvider implements VideoProvider {

    abstract get name(): string;

    abstract isApplicable(): boolean;

    constructor() { }

    abstract getVideoElement(): HTMLVideoElement | null;


    abstract getContentInfo(): {
        contentId: string | null;
        title: string | null;
        duration: number | null;
    };


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
