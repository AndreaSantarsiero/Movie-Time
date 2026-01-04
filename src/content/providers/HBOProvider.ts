import { AbstractVideoProvider } from "./AbstractVideoProvider";



export class HBOProvider extends AbstractVideoProvider {

    get name(): string {
        return "hbo";
    }


    isApplicable(): boolean {
        return window.location.hostname.includes("max.com") || window.location.hostname.includes("hbo.com");
    }


    getVideoElement(): HTMLVideoElement | null {
        return document.querySelector("video");
    }


    getContentInfo() {
        return {
            contentId: location.pathname,
            title: document.title,
            duration: this.getDuration()
        };
    }
}
