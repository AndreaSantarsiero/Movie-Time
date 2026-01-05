import { AbstractVideoProvider } from "./AbstractVideoProvider";



export class HuluProvider extends AbstractVideoProvider {

    get name(): string {
        return "hulu";
    }


    isApplicable(): boolean {
        return window.location.hostname.includes("hulu.com");
    }


    getContentInfo() {
        const title = document.title?.trim() || "Hulu Video";
        // Hulu URLs are usually /watch/<id>
        const contentId = location.pathname;

        const video = this.getVideoElement();
        const duration = video && Number.isFinite(video.duration) ? video.duration : 0;

        return { contentId, title, duration };
    }


    // Hulu ads often overlay or interrupt main video
    isAdPlaying(): boolean {
        const adCountdown = document.querySelector("div[class*='AdCountdown']");
        const adContainer = document.querySelector("div[class*='AdContainer']");
        const adOverlay = document.querySelector(".ad-overlay");

        if (this.isVisible(adCountdown) || this.isVisible(adContainer) || this.isVisible(adOverlay)) {
            return true;
        }

        return false;
    }
}
