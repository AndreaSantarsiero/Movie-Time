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
   * Timeout massimo oltre il quale, se non arrivano heartbeat dal leader
   * mentre siamo in stato synced, la connessione di sync può essere
   * considerata degradata o interrotta (ms).
   */
  leaderHeartbeatTimeoutMs: number;


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

  autoSyncIntervalMs: 5000,
  leaderHeartbeatTimeoutMs: 17000,

  softDesyncThresholdSeconds: 0.5,
  hardDesyncThresholdSeconds: 3.0,

  suppressAutoMessagesAfterLocalMs: 4000,

  forcePlaybackRateOnSync: true,
  forcedPlaybackRate: 1.0,

  debugLogs: true,
};



// opzionale: alias comodo da importare direttamente
export const syncConfig: SyncConfig = defaultSyncConfig;
