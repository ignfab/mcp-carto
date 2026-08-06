import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import packageJson from "../package.json" with { type: "json" };
import { createServer } from "../server.ts";

const RESOURCE_URI = "ui://mcp-carto/mcp-app.html";
const TOOL_NAME = "show_plan_ign_map";

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
}

test("MCP app exposes its UI resource and map tool", async (t) => {
  const server = createServer();
  const client = new Client(
    { name: "mcp-carto-test", version: "0.0.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  assert.deepEqual(client.getServerVersion(), {
    name: packageJson.name,
    version: packageJson.version,
  });

  const resources = await client.listResources();
  const appResource = resources.resources.find(({ uri }) => uri === RESOURCE_URI);

  assert.ok(appResource, `Expected ${RESOURCE_URI} to be listed`);
  assert.equal(appResource.mimeType, RESOURCE_MIME_TYPE);

  const resource = await client.readResource({ uri: RESOURCE_URI });

  assert.equal(resource.contents.length, 1);
  const [content] = resource.contents;
  assert.equal(content.uri, RESOURCE_URI);
  assert.equal(content.mimeType, RESOURCE_MIME_TYPE);
  assert.ok("text" in content);
  assert.match(content.text, /<html\b/);
  assert.match(content.text, /id="map"/);

  assertRecord(content._meta);
  assertRecord(content._meta.ui);
  assertRecord(content._meta.ui.csp);
  const expectedCspDomains = [
    "https://data.geopf.fr",
    "https://demo-geocontext.mut-dev.ign.fr",
    "https://qlf-geollm.beta.ign.fr",
    "https://geollm.beta.ign.fr",
    "http://localhost:3002",
  ];
  assert.deepEqual(content._meta.ui.csp.connectDomains, expectedCspDomains);
  assert.deepEqual(content._meta.ui.csp.resourceDomains, expectedCspDomains);

  const tools = await client.listTools();
  const mapTool = tools.tools.find(({ name }) => name === TOOL_NAME);

  assert.ok(mapTool, `Expected ${TOOL_NAME} to be listed`);
  assertRecord(mapTool._meta);
  assert.equal(mapTool._meta[RESOURCE_URI_META_KEY], RESOURCE_URI);
  assertRecord(mapTool._meta.ui);
  assert.equal(mapTool._meta.ui.resourceUri, RESOURCE_URI);

  const result = await client.callTool({
    name: TOOL_NAME,
    arguments: {
      title: "Test Carte IGN",
      description: "Smoke test MCP App",
      background: "plan_ign_v2",
      lon: 2.2945,
      lat: 48.8584,
      zoom: 15,
    },
  });

  assert.deepEqual(result.content, [
    {
      type: "text",
      text: "Plan IGN v2 : lon 2.29450, lat 48.85840, zoom 15, sans couche",
    },
  ]);
  assertRecord(result.structuredContent);
  assert.equal(result.structuredContent.title, "Test Carte IGN");
  assert.equal(result.structuredContent.description, "Smoke test MCP App");
  assert.equal(result.structuredContent.background, "plan_ign_v2");
  assert.equal(result.structuredContent.lon, 2.2945);
  assert.equal(result.structuredContent.lat, 48.8584);
  assert.equal(result.structuredContent.zoom, 15);
  assertRecord(result._meta);
  assert.equal(typeof result._meta.viewUUID, "string");
});
