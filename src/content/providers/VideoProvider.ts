export interface VideoProvider {
    /**
     * Uniquely identifies the provider type
     */
    get name(): string;


    /**
     * Determines if this provider can handle the current page
     */
    isApplicable(): boolean;


    /**
     * Returns metadata about the current media
     * - contentId: Used for room matching (must be consistent across peers)
     * - title: Displayed in the UI
     * - duration: Used for sync validation
     */
    getContentInfo(): {
        contentId: string | null;
        title: string | null;
        duration: number | null;
    };


    /** 
     * Returns the underlying video element if available
     */
    getVideoElement(): HTMLVideoElement | null;


    // Playback Control
    play(): void;
    pause(): void;
    seek(timeSec: number): void;
    setPlaybackRate(rate: number): void;

    // State Retrieval
    getTime(): number;
    getDuration(): number;
    isPaused(): boolean;
    isBuffering(): boolean;
}
