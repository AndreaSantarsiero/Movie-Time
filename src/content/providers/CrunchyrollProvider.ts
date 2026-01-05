import { AbstractVideoProvider } from "./AbstractVideoProvider";



export class CrunchyrollProvider extends AbstractVideoProvider {

    get name(): string {
        return "crunchyroll";
    }


    isApplicable(): boolean {
        return window.location.hostname.includes("crunchyroll.com");
    }


    getContentInfo() {
        // Crunchyroll URL: /watch/GY2P9Q9Y/title
        // Sometimes series info is in URL
        const title = document.title?.trim() || "Crunchyroll Video";

        // Use URL as stable ID
        const contentId = location.pathname;

        const video = this.getVideoElement();
        const duration = video && Number.isFinite(video.duration) ? video.duration : 0;

        return { contentId, title, duration };
    }


    isAdPlaying(): boolean {
        const adOverlay = document.getElementById("vilos-ad-overlay");
        const adMessage = document.querySelector(".ad-message");
        const adCountdown = document.querySelector("[data-testid='ad-countdown']");

        if (adOverlay || adMessage || adCountdown) {
            return true;
        }

        return false;
    }
}
