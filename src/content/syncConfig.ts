export interface SyncConfig {
  /**
   * Controllo sulla compatibilità dei media.
   * Se abilitato, il sync parte solo se la differenza relativa tra le durate
   * dei due contenuti è inferiore a `maxDurationDeltaRatio`.
   */
  enabledDurationCheck: boolean;


  /**
   * Differenza massima relativa tra le durate dei due media
   * (es. 0.01 = 1%).
   */
  maxDurationDeltaRatio: number;


  /**
   * Intervallo degli heartbeat automatici inviati dal leader (ms).
   */
  autoSyncIntervalMs: number;


  /**
   * Soglia di desync "morbida" in secondi: differenze inferiori a questa
   * soglia vengono generalmente ignorate e non causano alcun riallineamento.
   */
  softDesyncThresholdSeconds: number;

  /**
   * Soglia di desync "duro" in secondi: differenze superiori a questa
   * soglia causano un hard seek del follower verso lo stato del leader.
   */
  hardDesyncThresholdSeconds: number;


  /**
   * Finestra di tempo dopo un’azione manuale locale durante la quale
   * i messaggi automatici provenienti dal leader vengono ignorati (ms).
   * Serve a evitare che un heartbeat "vecchio" sovrascriva lo stato
   * appena deciso da un manual trigger.
   */
  suppressAutoMessagesAfterLocalMs: number;


  /**
   * Compensazione fissa (in secondi) da aggiungere al tempo ricevuto
   * per mitigare il ritardo di rete medio (es. 0.03 = 30ms).
   * Migliora la sync su lunghe distanze; su brevi distanze il follower
   * sarà leggermente "avanti" (~20ms), comunque impercettibile.
   */
  approximateNetworkDelaySeconds: number;


  /**
   * Se true, durante il full sync iniziale e gli hard sync, il playbackRate
   * viene forzato a `forcedPlaybackRate` su entrambi i peer.
   */
  forcePlaybackRateOnSync: boolean;


  /**
   * Valore di playbackRate da applicare quando `forcePlaybackRateOnSync` è true.
   */
  forcedPlaybackRate: number;


  /**
   * Abilita log di debug del protocollo di sync (utile in sviluppo).
   */
  debugLogs: boolean;
}



export const defaultSyncConfig: SyncConfig = {
  enabledDurationCheck: true,
  maxDurationDeltaRatio: 0.5,

  autoSyncIntervalMs: 4000,

  softDesyncThresholdSeconds: 0.5,
  hardDesyncThresholdSeconds: 2.5,

  suppressAutoMessagesAfterLocalMs: 3000,
  approximateNetworkDelaySeconds: 0.03,

  forcePlaybackRateOnSync: true,
  forcedPlaybackRate: 1.0,

  debugLogs: true,
};



// opzionale: alias comodo da importare direttamente
export const syncConfig: SyncConfig = defaultSyncConfig;
