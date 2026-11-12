import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// node --test runs each test file in its own process: the variable is set
// before server.ts is loaded, as it would be in the container.
process.env.CSP_CONNECT_DOMAINS = " https://qlf-geollm.beta.ign.fr/, http://localhost:3002 ";
const { createServer, parseConnectDomains } = await import("../server.ts");

test("CSP_CONNECT_DOMAINS is added to the UI resource connectDomains only", async (t) => {
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

  const resource = await client.readResource({ uri: "ui://mcp-carto/mcp-app.html" });

  assert.deepEqual(resource.contents[0]._meta?.ui, {
    csp: {
      connectDomains: [
        "https://data.geopf.fr",
        "https://qlf-geollm.beta.ign.fr",
        "http://localhost:3002",
      ],
      resourceDomains: ["https://data.geopf.fr"],
    },
  });
});

test("parseConnectDomains normalizes and validates origins", () => {
  assert.deepEqual(parseConnectDomains(undefined), ["https://data.geopf.fr"]);
  assert.deepEqual(parseConnectDomains(""), ["https://data.geopf.fr"]);
  assert.deepEqual(
    parseConnectDomains("https://a.ign.fr,https://data.geopf.fr/  https://a.ign.fr"),
    ["https://data.geopf.fr", "https://a.ign.fr"],
  );
  for (const invalid of [
    "qlf-geollm.beta.ign.fr",
    "https://geollm.beta.ign.fr/geocontext",
    "https://geollm.beta.ign.fr;https://evil.example",
    "https://*.ign.fr",
    "wss://geollm.beta.ign.fr",
    '"https://geollm.beta.ign.fr"',
  ]) {
    assert.throws(() => parseConnectDomains(invalid), /CSP_CONNECT_DOMAINS: invalid origin/, invalid);
  }
});
