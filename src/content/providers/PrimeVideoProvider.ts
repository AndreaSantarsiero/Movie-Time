import { AbstractVideoProvider } from "./AbstractVideoProvider";



export class PrimeVideoProvider extends AbstractVideoProvider {

    get name(): string {
        return "primevideo";
    }


    isApplicable(): boolean {
        return (
            window.location.hostname.includes("amazon.") ||
            window.location.hostname.includes("primevideo.")
        );
    }


    getContentInfo() {
        const title = document.title;
        const duration = this.getDuration();
        return { contentId: location.pathname, title, duration };
    }


    play(): void {
        super.play();
        // Fallback: Click the UI button
        if (this.isPaused()) {
            const btn = document.querySelector(".atvwebplayersdk-playpause-button");
            if (btn instanceof HTMLElement) btn.click();
        }
    }


    pause(): void {
        super.pause();
        // Fallback: Click UI
        if (!this.isPaused()) {
            const btn = document.querySelector(".atvwebplayersdk-playpause-button");
            if (btn instanceof HTMLElement) btn.click();
        }
    }


    seek(timeSec: number): void {
        const video = this.getVideoElement();
        if (video) {
            video.currentTime = timeSec;
            // Force UI update for React/Custom players
            video.dispatchEvent(new Event('timeupdate', { bubbles: true }));
            video.dispatchEvent(new Event('seeking', { bubbles: true }));
            video.dispatchEvent(new Event('seeked', { bubbles: true }));
        }
    }


    isAdPlaying(): boolean {

        const adIndicators = [
            ".atvwebplayersdk-ad-timer",      // Common timer
            ".fu4rd6c",                       // Obfuscated class seen in some regions
            "[data-testid='ad-overlay']",
            ".ad-counter"
        ];

        for (const sel of adIndicators) {
            if (document.querySelector(sel)) return true;
        }

        return false;
    }
}
