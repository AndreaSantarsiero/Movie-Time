import { AbstractVideoProvider } from "./AbstractVideoProvider";



/**
 * Generic Provider
 * Fallback for any site with a <video> tag
 */
export class GenericProvider extends AbstractVideoProvider {

    get name(): string {
        return "generic";
    }

    isApplicable(): boolean {
        return document.querySelectorAll("video").length > 0;
    }


    getContentInfo() {
        const video = this.getVideoElement();
        const duration = video && Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : null;

        const title = document.title?.trim() || "Unknown Video";

        // Remove query params for stable ID
        const contentId = location.origin + location.pathname;

        return { contentId, title, duration };
    }
}
