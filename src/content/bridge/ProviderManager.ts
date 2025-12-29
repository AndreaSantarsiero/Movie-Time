import { VideoProvider } from "../providers/VideoProvider";
import { GenericProvider } from "../providers/GenericProvider";
import { NetflixProvider } from "../providers/NetflixProvider";



const providers: VideoProvider[] = [
    new NetflixProvider(),
    // Add other specific providers here e.g. new YouTubeProvider()
];



/**
 * Manages the selection and retrieval of video providers
 */
export class ProviderManager {

    private activeProvider: VideoProvider | null = null;
    private genericProvider: GenericProvider = new GenericProvider();


    constructor() {
        this.selectProvider();
    }


    private selectProvider() {
        for (const p of providers) {
            if (p.isApplicable()) {
                console.log(`[ProviderManager] Selected provider: ${p.name}`);
                this.activeProvider = p;
                return;
            }
        }
        console.log(`[ProviderManager] No specific provider found, using GenericProvider`);
        this.activeProvider = this.genericProvider;
    }


    getProvider(): VideoProvider {
        if (!this.activeProvider) {
            this.selectProvider();
        }
        return this.activeProvider!;
    }
}
