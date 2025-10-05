export function log(...args: any[]) {
  console.log("[netflix-sync]", ...args);
}
export function warn(...args: any[]) {
  console.warn("[netflix-sync]", ...args);
}
export function error(...args: any[]) {
  console.error("[netflix-sync]", ...args);
}
