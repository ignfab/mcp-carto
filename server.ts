import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

const resourceUri = "ui://mcp-carte-ign/mcp-app.html";

const cspMeta = {
  ui: {
    csp: {
      connectDomains: ["https://data.geopf.fr"],
      resourceDomains: ["https://data.geopf.fr"],
    },
  },
};

const inputSchema = {
  title: z.string().optional().default("Carte IGN").describe("Titre de la vue (optionnel)"),
  description: z.string().describe("Description de la vue (optionnel)"),
  background: z
    .enum(["plan_ign_v2", "orthophotos"])
    .optional()
    .default("plan_ign_v2")
    .describe("Fond de carte: plan IGN v2 (carte, plan) ou photographies aeriennes (photo, image, imagerie)"),
  lon: z
    .number()
    .min(-180)
    .max(180)
    .describe("Longitude en degrés décimaux (WGS84)"),
  lat: z
    .number()
    .min(-90)
    .max(90)
    .describe("Latitude en degrés décimaux (WGS84)"),
  zoom: z
    .number()
    .min(0)
    .max(19)
    .optional()
    .default(12)
    .describe(
      "Niveau de zoom (0 = monde, 19 = max pour Plan IGN v2 / PM_0_19)",
    ),
  layers: z
    .array(
      z.object({
        title: z.string().describe("Titre de la couche"),
        data_url: z.string().url().describe("URL d'un GeoJSON (astuce : utiliser gpf_get_features de geocontext avec result_type=url)"),
      }),
    )
    .optional()
    .describe("Liste des couches GeoJSON à charger sur la carte"),
};

const outputSchema = inputSchema;

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-carte-ign",
    version: "1.0.0",
  });

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: cspMeta,
          },
        ],
      };
    },
  );

  registerAppTool(
    server,
    "show_plan_ign_map",
    {
      title: "Afficher la carte IGN",
      description: `Affiche une carte interactive OpenLayers avec 
      un fond de carte WMTS de la Géoplateforme (Plan IGN v2 ou photographies aeriennes), 
      centrée sur longitude, latitude et zoom, 
      et des données à partir d'une URL au format GeoJSON (optionnel).
      `,
      inputSchema,
      outputSchema,
      _meta: { ui: { resourceUri } },
    },
    async ({ lon, lat, zoom, layers, title, description, background }): Promise<CallToolResult> => {
      const zLevel = zoom ?? 12;
      const bg = background ?? "plan_ign_v2";
      const layersText = layers && layers.length > 0
        ? `, ${layers.length} couche(s) (${layers.map(l => l.title).join(", ")})`
        : ", sans couche";
      const bgText = bg === "orthophotos" ? "Orthophotos" : "Plan IGN v2";
      const text = `${bgText} : lon ${lon.toFixed(5)}, lat ${lat.toFixed(5)}, zoom ${zLevel}${layersText}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: { lon, lat, zoom: zLevel, layers, title, description, background: bg },
        _meta: { viewUUID: randomUUID() },
      };
    },
  );

  return server;
}
