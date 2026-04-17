import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import "./global.css";
import "./mcp-app.css";


import map, { getMap, applyView } from "./map/map.ts";

const mainEl = document.querySelector(".main") as HTMLElement;

function parseViewArgs(
  args: Record<string, unknown> | undefined,
): {
  lon: number;
  lat: number;
  zoom: number;
  background: "plan_ign_v2" | "orthophotos";
  data_url?: string;
  title?: string;
  description?: string;
} | null {
  if (!args) return null;
  const lon = args.lon;
  const lat = args.lat;
  const zoom = args.zoom;
  const background = args.background;
  const dataUrl = args.data_url;
  const title = args.title;
  const description = args.description;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  const zRaw =
    typeof zoom === "number" && Number.isFinite(zoom) ? zoom : 12;
  const z = Math.min(19, Math.max(0, Math.round(zRaw)));
  const bg = background === "orthophotos" ? "orthophotos" : "plan_ign_v2";
  const data_url = typeof dataUrl === "string" ? dataUrl : undefined;
  return {
    lon,
    lat,
    zoom: z,
    background: bg,
    data_url,
    title: typeof title === "string" ? title : undefined,
    description: typeof description === "string" ? description : undefined,
  };
}

function parseViewFromResult(
  result: CallToolResult,
): {
  lon: number;
  lat: number;
  zoom: number;
  background: "plan_ign_v2" | "orthophotos";
  data_url?: string;
  title?: string;
  description?: string;
} | null {
  const sc = result.structuredContent as
    | {
        lon?: unknown;
        lat?: unknown;
        zoom?: unknown;
        background?: unknown;
        data_url?: unknown;
        title?: unknown;
        description?: unknown;
      }
    | undefined;
  if (!sc) return null;
  return parseViewArgs(sc as Record<string, unknown>);
}



function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
  if (ctx.safeAreaInsets) {
    mainEl.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
    mainEl.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
    mainEl.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
    mainEl.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
  }
}

const app = new App({ name: "Carte IGN", version: "1.0.0" });

app.onteardown = async () => {
  if (map && map.getTarget()) {
    map.setTarget(undefined);
  }
//   dataLayer = null;
  return {};
};

app.ontoolinput = (params) => {
  const v = parseViewArgs(params.arguments);
  if (v) {
    void applyView(v.lon, v.lat, v.zoom, v.background, v.data_url, v.title, v.description);
  }
};

app.ontoolresult = (result) => {
  const v = parseViewFromResult(result);
  if (v) {
    void applyView(v.lon, v.lat, v.zoom, v.background, v.data_url, v.title, v.description);
  }
};

app.onerror = console.error;
app.onhostcontextchanged = handleHostContextChanged;

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
  // init map
  getMap();
});
