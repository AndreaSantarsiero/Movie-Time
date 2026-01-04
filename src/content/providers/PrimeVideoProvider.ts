import { AbstractVideoProvider } from "./AbstractVideoProvider";



export class PrimeVideoProvider extends AbstractVideoProvider {

    get name(): string {
        return "primevideo";
    }


    isApplicable(): boolean {
        return (
            window.location.hostname.includes("amazon.") ||
            window.location.hostname.includes("primevideo.")
        ) && !!document.querySelector(".webPlayerSDKContainer");
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


    // Default seek/isBuffering from AbstractVideoProvider work on video element
}
