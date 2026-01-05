import { AbstractVideoProvider } from "./AbstractVideoProvider";



export class StreamingPlatformProvider extends AbstractVideoProvider {

    get name(): string {
        return "streaming_platform";
    }


    isApplicable(): boolean {
        const host = window.location.hostname;
        return host.includes("streaming") || document.referrer.includes("streaming");
    }


    getContentInfo() {
        const title = document.title?.trim() || "Streaming Video";
        const contentId = location.pathname + (location.search || "");

        const video = this.getVideoElement();
        const duration = video && Number.isFinite(video.duration) ? video.duration : 0;

        return { contentId, title, duration };
    }


    isAdPlaying(): boolean {
        const video = this.getVideoElement();
        if (!video) return false;

        const adSelectors = [
            ".ad-container",
            "#ad-overlay",
            "div[id*='ads']",
            "div[class*='advert']",
            "iframe[src*='ads']" // ads inside iframes
        ];

        for (const sel of adSelectors) {
            if (document.querySelector(sel)) return true;
        }

        return false;
    }
}
