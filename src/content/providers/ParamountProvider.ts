import { AbstractVideoProvider } from "./AbstractVideoProvider";



export class ParamountProvider extends AbstractVideoProvider {

    get name(): string {
        return "paramount";
    }


    isApplicable(): boolean {
        return window.location.hostname.includes("paramountplus.com");
    }


    getContentInfo() {
        return {
            contentId: location.pathname,
            title: document.title,
            duration: this.getDuration()
        };
    }
}
