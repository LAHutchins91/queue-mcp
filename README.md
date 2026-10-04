# Queue

Queue keeps a team's approved support response times by customer plan: which reply window, which channel, and which staffing promise may be stated, then lets an assistant read that set before it replies.

An assistant can store and look up what the team has approved for each plan. It must refuse a faster reply, a dedicated agent, or a channel that plan does not include. It does not invent a softer promise.

It works with ChatGPT, Claude, Gemini, Grok, and Cursor, plus any other MCP client that can do Streamable HTTP and OAuth. It is not a ChatGPT-only plugin.

Sign in with your Queue account when the assistant opens OAuth. Do not paste an API key or password into a header. Response tools need Pro or an active trial. The trial is 14 days, then Pro. Checkout shows the plan terms. This page does not print a price.

## What the assistant can do

After you approve the connection, the server exposes these tools:

- list_response_catalogs
- create_response_catalog
- save_customer_plan
- search_customer_plans
- save_reply_window
- list_reply_windows
- save_plan_channel
- list_plan_channels
- save_staffing_promise
- list_staffing_promises
- evaluate_support_promise
- evaluate_plan_coverage
- get_queue_context

`evaluate_support_promise` returns APPROVED only for a reply window, a channel, or a staffing promise already stored on that customer plan. Otherwise it returns REFUSED and the assistant must not promise a faster reply, a dedicated agent, or a channel the plan does not include. `evaluate_plan_coverage` refuses a channel or staffing promise that is outside the saved plan. The assistant only calls these tools when you and the host allow it.

## Connect

Run the server and use its `/mcp` path. With the default local base, that is `http://localhost:3000/mcp`. A deployed host uses the same path on `APP_BASE_URL`.

Cursor, in `~/.cursor/mcp.json` or a project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "queue": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Claude Code:

```bash
claude mcp add --transport http queue http://localhost:3000/mcp
```

Do not pass an Authorization header. Other clients add the same URL, choose OAuth, and leave client id and secret empty. Queue supports dynamic client registration. Full steps for ChatGPT, Claude, Gemini, Grok, and Cursor are on the server's `/connect` page.

When stdin is a terminal, Queue serves Streamable HTTP. When stdin is not a terminal, it also speaks MCP on stdio. That is the same choice status-mcp makes, so a launcher can attach stdin.

Registry metadata for this server is in `server.json` (`io.github.LAHutchins91/queue`).

## Run

```bash
npm ci
npm test
npm run build
npm start
```

Hosted accounts use Supabase for sign-in and response storage, and Stripe for the 14-day trial and Pro. Copy `.env.example` to `.env` and set the variables there. `supabase/schema.sql` creates the tables. Stripe price ids belong in the environment. Queue never displays the amount.

Local stdio, with no account configured, stores one operator's response catalog under `QUEUE_DATA_DIR` (or the system temp directory). HTTP tool calls still require OAuth and an active trial or Pro.

```bash
docker build -t queue-mcp .
docker run --rm -p 3000:3000 queue-mcp
```

A container without a terminal on stdin speaks MCP on stdio and still listens on port 3000.
