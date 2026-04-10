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
  data_url: z
    .string()
    .url()
    .optional()
    .describe("URL d'un GeoJSON a charger sur la carte (astuce : utiliser gpf_get_features de geocontext avec result_type=url"),
};

const outputSchema = inputSchema;
// const outputSchema = z.object({
//   lon: z.number(),
//   lat: z.number(),
//   zoom: z.number(),
//   data_url: z.string().optional(),
// });

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
      title: "Afficher la carte Plan IGN v2",
      description: `Affiche une carte interactive OpenLayers avec 
      la couche WMTS Plan IGN v2 (GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2, PM_0_19) de la Géoplateforme (data.geopf.fr), 
      centrée sur longitude, latitude et zoom, 
      et des données à partir d'une URL au format GeoJSON (optionnel).
      `,
      inputSchema,
      outputSchema,
      _meta: { ui: { resourceUri } },
    },
    async ({ lon, lat, zoom, data_url, title, description }): Promise<CallToolResult> => {
      const zLevel = zoom ?? 12;
      const dataText = data_url
        ? `, GeoJSON ${data_url}`
        : ", sans GeoJSON";
      const text = `Plan IGN v2 : lon ${lon.toFixed(5)}, lat ${lat.toFixed(5)}, zoom ${zLevel}${dataText}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: { lon, lat, zoom: zLevel, data_url, title, description },
        _meta: { viewUUID: randomUUID() },
      };
    },
  );

  return server;
}
