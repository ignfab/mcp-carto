import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getTopLeft, getWidth } from "ol/extent.js";
import Map from "ol/Map.js";
import View from "ol/View.js";
import TileLayer from "ol/layer/Tile.js";
import { fromLonLat, get as getProjection } from "ol/proj.js";
import WMTS from "ol/source/WMTS.js";
import WMTSTileGrid from "ol/tilegrid/WMTS.js";
import "ol/ol.css";
import "./global.css";
import "./mcp-app.css";

const mainEl = document.querySelector(".main") as HTMLElement;
const coordsLabel = document.getElementById("coords-label")!;

function parseViewArgs(
  args: Record<string, unknown> | undefined,
): { lon: number; lat: number; zoom: number } | null {
  if (!args) return null;
  const lon = args.lon;
  const lat = args.lat;
  const zoom = args.zoom;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  const zRaw =
    typeof zoom === "number" && Number.isFinite(zoom) ? zoom : 12;
  const z = Math.min(19, Math.max(0, Math.round(zRaw)));
  return { lon, lat, zoom: z };
}

function parseViewFromResult(
  result: CallToolResult,
): { lon: number; lat: number; zoom: number } | null {
  const sc = result.structuredContent as
    | { lon?: unknown; lat?: unknown; zoom?: unknown }
    | undefined;
  if (!sc) return null;
  return parseViewArgs(sc as Record<string, unknown>);
}

let map: Map | null = null;

/** Plan IGN v2 — même paramètres que GetTile Géoplateforme (PM_0_19, image/png). */
function createPlanIgnV2Source(): WMTS {
  const projection = getProjection("EPSG:3857")!;
  const extent = projection.getExtent();
  const size = getWidth(extent) / 256;
  const resolutions: number[] = [];
  const matrixIds: string[] = [];
  for (let z = 0; z <= 19; z++) {
    resolutions.push(size / 2 ** z);
    matrixIds.push(String(z));
  }
  return new WMTS({
    url: "https://data.geopf.fr/wmts",
    layer: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
    matrixSet: "PM_0_19",
    format: "image/png",
    projection,
    tileGrid: new WMTSTileGrid({
      origin: getTopLeft(extent),
      resolutions,
      matrixIds,
      tileSize: [256, 256],
    }),
    style: "normal",
    crossOrigin: "anonymous",
    attributions:
      '© <a href="https://www.ign.fr/" target="_blank" rel="noreferrer">IGN</a> · Géoplateforme',
    wrapX: true,
  });
}

function ensureMap(): Map {
  if (map) return map;
  map = new Map({
    target: "map",
    layers: [
      new TileLayer({
        source: createPlanIgnV2Source(),
      }),
    ],
    view: new View({
      center: fromLonLat([2.3522, 48.8566]),
      zoom: 12,
      maxZoom: 19,
      minZoom: 0,
    }),
  });
  return map;
}

function applyView(lon: number, lat: number, zoom: number) {
  const z = Math.min(19, Math.max(0, zoom));
  const m = ensureMap();
  m.getView().setCenter(fromLonLat([lon, lat]));
  m.getView().setZoom(z);
  coordsLabel.textContent = `lon ${lon.toFixed(5)} · lat ${lat.toFixed(5)} · zoom ${z}`;
  m.updateSize();
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

const app = new App({ name: "Carte Plan IGN v2", version: "1.0.0" });

app.onteardown = async () => {
  if (map) {
    map.setTarget(undefined);
    map = null;
  }
  return {};
};

app.ontoolinput = (params) => {
  const v = parseViewArgs(params.arguments);
  if (v) applyView(v.lon, v.lat, v.zoom);
};

app.ontoolresult = (result) => {
  const v = parseViewFromResult(result);
  if (v) applyView(v.lon, v.lat, v.zoom);
};

app.onerror = console.error;
app.onhostcontextchanged = handleHostContextChanged;

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
  ensureMap();
});
