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

const resourceUri = "ui://osm-openlayers/mcp-app.html";

const cspMeta = {
  ui: {
    csp: {
      connectDomains: ["https://*.openstreetmap.org"],
      resourceDomains: ["https://*.openstreetmap.org"],
    },
  },
};

const inputSchema = {
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
    .max(20)
    .optional()
    .default(12)
    .describe("Niveau de zoom OpenLayers (0 = monde, ~19 = rue)"),
};

const outputSchema = z.object({
  lon: z.number(),
  lat: z.number(),
  zoom: z.number(),
});

export function createServer(): McpServer {
  const server = new McpServer({
    name: "OSM OpenLayers Map",
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
    "show_osm_map",
    {
      title: "Afficher une carte OSM",
      description:
        "Affiche une carte interactive OpenLayers avec tuiles OpenStreetMap, centrée sur longitude, latitude et niveau de zoom donnés.",
      inputSchema,
      outputSchema,
      _meta: { ui: { resourceUri } },
    },
    async ({ lon, lat, zoom }): Promise<CallToolResult> => {
      const zLevel = zoom ?? 12;
      const text = `Carte OSM : lon ${lon.toFixed(5)}, lat ${lat.toFixed(5)}, zoom ${zLevel}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: { lon, lat, zoom: zLevel },
        _meta: { viewUUID: randomUUID() },
      };
    },
  );

  return server;
}
