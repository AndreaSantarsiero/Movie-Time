export type SyncMessage = {
  type: "cmd";
  action: "play" | "pause" | "seek";
  time: number;
};

export type SignalingMessage = {
  type: "offer" | "answer" | "ice";
  payload: any;
};
