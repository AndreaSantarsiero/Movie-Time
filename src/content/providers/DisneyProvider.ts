import { AbstractVideoProvider } from "./AbstractVideoProvider";



export class DisneyProvider extends AbstractVideoProvider {

    get name(): string {
        return "disney";
    }


    isApplicable(): boolean {
        return window.location.hostname.includes("disneyplus.com");
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
