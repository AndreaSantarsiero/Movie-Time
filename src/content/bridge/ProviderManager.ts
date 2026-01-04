import { AbstractVideoProvider } from "../providers/AbstractVideoProvider";
import { GenericProvider } from "../providers/GenericProvider";
import { NetflixProvider } from "../providers/NetflixProvider";
import { YouTubeProvider } from "../providers/YouTubeProvider";
import { PrimeVideoProvider } from "../providers/PrimeVideoProvider";
import { DisneyProvider } from "../providers/DisneyProvider";
import { HBOProvider } from "../providers/HBOProvider";
import { ParamountProvider } from "../providers/ParamountProvider";



const providers: AbstractVideoProvider[] = [
    new NetflixProvider(),
    new YouTubeProvider(),
    new PrimeVideoProvider(),
    new DisneyProvider(),
    new HBOProvider(),
    new ParamountProvider(),
];



/**
 * Manages the selection and retrieval of video providers
 */
export class ProviderManager {

    private activeProvider: AbstractVideoProvider | null = null;
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


    async getProvider(): Promise<AbstractVideoProvider> {
        if (!this.activeProvider) {
            this.selectProvider();
        }
        return this.activeProvider!;
    }
}
