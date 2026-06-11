import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import packageJson from "./package.json" with { type: "json" };

const INPUT = process.env.INPUT;
if (!INPUT) {
  throw new Error("INPUT environment variable is not set");
}

const isDevelopment = process.env.NODE_ENV === "development";

export default defineConfig({
  plugins: [viteSingleFile()],
  define: {
    __PACKAGE_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    sourcemap: isDevelopment ? "inline" : undefined,
    cssMinify: !isDevelopment,
    minify: !isDevelopment,
    rollupOptions: {
      input: INPUT,
    },
    outDir: "dist",
    emptyOutDir: false,
  },
});
