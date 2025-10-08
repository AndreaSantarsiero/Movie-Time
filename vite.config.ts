import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);



// helper per evitare ripetizioni
function iifeSingleFile(entryAbsPath: string, outFileName: string) {
  return {
    build: {
      outDir: "dist",
      emptyOutDir: false,      // lasciamo intatti gli output delle build precedenti
      sourcemap: true,
      rollupOptions: {
        input: entryAbsPath,   // SINGLE input ⇒ ok usare inlineDynamicImports
        output: {
          format: "iife",
          inlineDynamicImports: true,
          entryFileNames: outFileName,
          assetFileNames: "[name].[ext]",
        },
      },
    },
  };
}


export default ({ mode }: { mode: string }) => {
  // default: prima build = popup (pulisce dist)
  if (mode === "popup" || !mode) {
    return {
      build: {
        outDir: "dist",
        emptyOutDir: true,   // la primissima build pulisce
        sourcemap: true,
        rollupOptions: {
          input: {
            popup: resolve(__dirname, "src/popup/popup.html"),
          },
          output: {
            // nessuna esigenza speciale per gli asset del popup
          },
        },
      },
    };
  }
  

  if (mode === "content") {
    // ATTENZIONE: NON elenchiamo overlay.ts come input.
    // Se content importa overlay.ts, con single input + inlineDynamicImports
    // verrà inline-ato nel content.js (niente import top-level).
    return iifeSingleFile(resolve(__dirname, "src/content/content.ts"), "content.js");
  }

  if (mode === "background") {
    return iifeSingleFile(resolve(__dirname, "src/background/background.ts"), "background.js");
  }

  if (mode === "bridge") {
    return iifeSingleFile(resolve(__dirname, "src/content/overlayBridge.ts"), "overlayBridge.js");
  }


  // fallback (non dovrebbe servire)
  return {};
};
