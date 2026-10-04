import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/server.js";

let server: Server;
let base: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };

describe("streamable HTTP", () => {
  it("returns Queue tools from tools/list without an API key", async () => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { result?: { tools?: Array<{ name: string; description?: string }> } };
    const tools = body.result?.tools ?? [];
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("evaluate_support_promise");
    expect(names).toContain("evaluate_plan_coverage");
    expect(names).toContain("save_reply_window");
    expect(names).toContain("save_plan_channel");
    expect(names).toContain("save_staffing_promise");
    expect(names).toContain("search_customer_plans");
    const text = JSON.stringify(tools);
    expect(text).not.toMatch(/\$\d/);
    expect(text).toMatch(/faster reply/i);
  });

  it("rejects a tool call that presents an API key header instead of OAuth", async () => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...headers, "x-api-key": "secret-key" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_response_catalogs", arguments: {} }
      })
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    const body = await response.json() as { error?: string };
    expect(body.error).toMatch(/Sign in to Queue/);
  });

  it("serves connect, health, and OAuth metadata", async () => {
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    const healthBody = await health.json() as { service: string };
    expect(healthBody.service).toBe("queue");

    const connect = await fetch(`${base}/connect`);
    const html = await connect.text();
    expect(connect.status).toBe(200);
    for (const name of ["ChatGPT", "Claude", "Gemini", "Grok", "Cursor"]) expect(html).toContain(name);
    expect(html).not.toMatch(/\$\d/);

    const metadata = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    const oauth = await metadata.json() as { resource: string; bearer_methods_supported: string[]; authorization_servers: string[] };
    expect(oauth.resource).toMatch(/\/mcp$/);
    expect(oauth.bearer_methods_supported).toEqual(["header"]);
    expect(oauth.authorization_servers[0]).toMatch(/\/auth\/v1$/);

    const home = await fetch(`${base}/`);
    const homeHtml = await home.text();
    expect(homeHtml).toContain("14-day trial, then Pro");
    expect(homeHtml).not.toMatch(/\$\d/);
    expect(homeHtml).toContain("Do not promise a faster reply.");
  });

  it("rejects a browser origin that is not an assistant", async () => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...headers, origin: "https://evil.example" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} })
    });
    expect(response.status).toBe(403);
  });
});
