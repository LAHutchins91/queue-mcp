import { canonicalPublicOrigin, legacyMcpUrl } from "./public-url.js";

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
}

export function landingConnectLead(baseUrl: string) {
  const origin = canonicalPublicOrigin(baseUrl);
  const mcp = htmlEscape(`${origin}/mcp`);
  const connect = htmlEscape(`${origin}/connect`);
  return `<p>MCP address: <code>${mcp}</code>. <a href="${connect}">Connect an assistant</a>.</p>`;
}

export function connectPageBody(baseUrl: string) {
  const origin = canonicalPublicOrigin(baseUrl);
  const mcp = htmlEscape(`${origin}/mcp`);
  const fallback = legacyMcpUrl(baseUrl);
  const fallbackHtml = fallback
    ? `<p>The earlier address <code>${htmlEscape(fallback)}</code> still reaches this server.</p>`
    : "";
  return `<p>Queue is one OAuth-protected response catalog for ChatGPT, Claude, Gemini, Grok, Cursor, and any other MCP client that speaks Streamable HTTP. Response tools require your Queue account with Pro or an active 14-day trial. Billing stays in the workspace. No assistant can change your plan, and Queue does not print a price.</p>
<section><h2>Shared connection</h2>
<p>MCP address:</p><p><code>${mcp}</code></p>
${fallbackHtml}
<p>Transport: Streamable HTTP. Sign in with your own Queue account when the assistant opens OAuth. Do not paste an API key, access token, or password into a header or chat. Revoke a host at any time from <a href="/connections">connected applications</a>.</p>
<ol><li><a href="/app">Sign in to the workspace</a> and open or create a response catalog you will recognize by name.</li><li>Add the MCP address in your assistant using the steps below. Choose dynamic registration / OAuth when the host asks how to authenticate.</li><li>Approve Queue, then ask the assistant to look up the customer's plan before it promises a reply time. It must refuse a faster reply, a dedicated agent, or a channel that plan does not include.</li></ol>
</section>
<section><h2>1. ChatGPT and Codex</h2>
<p>Connect Queue as a custom app. A public directory listing is not required.</p>
<ol><li>On workspace plans, an admin enables developer mode under Workspace settings, then Permissions and roles, then Connected data developer mode or Create custom MCP connectors. Personal accounts that already offer custom apps can skip that toggle.</li><li>Open Apps, then Create. Workspace admins use Workspace settings, Apps, Create. Other authorized users use Settings, Apps, Create.</li><li>Enter the MCP address, choose OAuth, scan tools, and approve the Queue sign-in.</li><li>Enable the app in the conversation. Developer-mode apps are labeled Dev and are not OpenAI-verified.</li></ol>
<p>Codex can use this same MCP address. Request <code>offline_access</code> when the host offers refresh. Queue’s authorization server advertises that scope.</p>
</section>
<section><h2>2. Claude</h2>
<p>Claude.ai, Claude Desktop, Cowork, and the mobile apps use a remote connector. Claude’s servers call Queue. You do not install a local plugin.</p>
<ol><li>Free, Pro, and Max: Customize, Connectors, Add custom connector. Team and Enterprise: an owner adds it under Organization settings, Connectors, Add, Custom, Web. Each member then chooses Connect.</li><li>Name it Queue and paste the MCP address.</li><li>Choose sign-in (OAuth). For the OAuth client, choose Register automatically (dynamic client registration). Leave client id and secret empty. Do not put a token in request headers.</li><li>Approve Queue in the browser, then turn the connector on from the chat plus menu, Connectors.</li></ol>
<p>Claude Code, from a terminal:</p>
<pre><code>claude mcp add --transport http queue ${mcp}</code></pre>
<p>Do not pass <code>--header Authorization</code>. Claude Code opens the same OAuth flow. In a JSON config, set <code>"type": "http"</code> next to <code>url</code>.</p>
</section>
<section><h2>3. Gemini</h2>
<h3>Gemini Apps</h3>
<p>Google’s Gemini Apps can add an MCP server URL in the Gemini web app. Google requires you to be 18 or older, in the US, signed in with a personal Google Account, with Keep Activity on. Work and school accounts cannot use this path. Custom apps are English-only. Connect on the web. The link then works in the Gemini mobile app too.</p>
<ol><li>On a computer, open gemini.google.com, Settings, Connected apps. If you do not see Connected apps, open Personal Intelligence, then Connected apps.</li><li>Under Custom apps, add a custom app and paste the MCP address.</li><li>Leave advanced credentials empty. Queue supports dynamic client registration, so a client id is not required.</li><li>Finish Google’s sign-in, then type <code>@</code> and choose Queue when you want that chat to use it.</li></ol>
<h3>Gemini CLI</h3>
<pre><code>gemini mcp add --transport http --scope user queue ${mcp}</code></pre>
<p>That writes <code>~/.gemini/settings.json</code>. Do not set an Authorization header. If the CLI reports a missing issuer (<code>iss</code>) on the callback, Google is enforcing RFC 9207 and the authorization server did not return that parameter. Queue cannot add it from this app. Use Gemini Apps, or another host, until that redirect includes <code>iss</code>.</p>
<h3>Not available yet</h3>
<ul><li><strong>Gemini API, including Gemini 3 in the Interactions API.</strong> Google’s Interactions API docs say Gemini 3 does not support remote MCP yet. There is no Queue function-calling schema to paste into AI Studio. Do not paste a Queue access token into a managed-agent tool.</li><li><strong>Gemini Enterprise custom MCP.</strong> The admin form requires a client id and secret for an OAuth app whose redirect URL is <code>https://vertexaisearch.cloud.google.com/oauth-redirect</code>. Queue does not publish that client. The public authorization and token URLs are on the Supabase issuer advertised at <code>/.well-known/oauth-protected-resource/mcp</code>. The scopes are <code>email</code> and <code>offline_access</code>. An owner has to register the Enterprise client in Supabase before that form can be saved.</li></ul>
</section>
<section><h2>4. Grok</h2>
<h3>Grok on the web</h3>
<ol><li>Open grok.com/connectors.</li><li>Choose New connector, then Custom.</li><li>Paste the MCP address and finish the sign-in Grok presents.</li></ol>
<p>On Grok Business and Enterprise, an admin provisions connectors before members can use them. The server must be reachable on the public internet. Grok discovers the tools after you connect.</p>
<h3>Grok Build</h3>
<pre><code>grok mcp add --transport http queue ${mcp}</code></pre>
<p>OAuth runs in the browser on first use. The equivalent user config is:</p>
<pre><code>[mcp_servers.queue]
url = "${mcp}"</code></pre>
<p>in <code>~/.grok/config.toml</code>. Do not set an Authorization header. In the Grok Build UI, <code>/mcps</code> then <code>i</code> starts sign-in.</p>
<h3>xAI API</h3>
<p>The xAI API remote-MCP tool accepts a static bearer token. Queue does not issue API keys or long-lived tokens for that field. Use grok.com or Grok Build, which perform OAuth, instead of pasting a session token into an API request.</p>
</section>
<section><h2>5. Cursor and other MCP clients</h2>
<p>Cursor speaks remote Streamable HTTP with OAuth. In <code>~/.cursor/mcp.json</code> (all projects) or <code>.cursor/mcp.json</code> (one project):</p>
<pre><code>{
  "mcpServers": {
    "queue": {
      "url": "${mcp}"
    }
  }
}</code></pre>
<p>Do not add <code>headers</code> or a static client id. Cursor registers a client and opens sign-in. Restart Cursor or enable the server under Customize, MCPs.</p>
<p>Any other MCP client uses the same address when it supports Streamable HTTP, OAuth 2.0 with PKCE, and dynamic client registration (RFC 7591). An unauthenticated call returns <code>401</code> with a <code>WWW-Authenticate</code> challenge pointing at <code>/.well-known/oauth-protected-resource/mcp</code>. Ask for the <code>email</code> scope. Add <code>offline_access</code> when the client can refresh tokens. Clients that call from their own servers should not send a browser <code>Origin</code>. Browser calls are accepted only from Queue and the assistant sites listed in the server allowlist.</p>
</section>
<section><h2>After it connects</h2>
<p>“Use Queue on <em>[catalog name]</em>. Look up the customer's plan before you promise a reply time. Do not promise a faster reply, a dedicated agent, or a channel unless Queue approves that exact wording for that plan.”</p>
<p><strong>Customer plans</strong> are the support plans the team has saved. <strong>Reply windows</strong> are the only waits an assistant may state, and nothing faster. <strong>Channels</strong> are the only ways to reach support that plan includes. <strong>Staffing promises</strong> say whether the plan is a shared queue or a dedicated agent.</p>
<p>The assistant calls tools only when you and the host allow it. Disconnecting an application stops future access. It does not delete the catalog or cancel billing.</p>
</section>`;
}
