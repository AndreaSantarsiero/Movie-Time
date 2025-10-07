import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        content: resolve(__dirname, "src/content/content.ts"),
        background: resolve(__dirname, "src/background/background.ts"),
        overlay: resolve(__dirname, "src/content/overlay.ts")
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "popup") return "popup.js";
          if (chunk.name === "content") return "content.js";
          if (chunk.name === "background") return "background.js";
          if (chunk.name === "overlay") return "overlay.js";
          return "[name].js";
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "popup.css") return "popup.css";
          if (assetInfo.name === "overlay.css") return "overlay.css";
          return "[name].[ext]";
        }
      }
    }
  }
});
