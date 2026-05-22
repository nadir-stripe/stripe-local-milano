# Olio d'Oro — ChatGPT MCP Server

ChatGPT app that lets users browse Olio d'Oro products and purchase via Stripe Checkout, rendered as product cards inside ChatGPT.

> **Requires a paid ChatGPT subscription** (Developer mode / connectors)

## How it works

1. User asks ChatGPT to find products ("Cercami un olio al tartufo")
2. ChatGPT calls `search_products` on this MCP server
3. Server queries Stripe Products API and returns matching products
4. ChatGPT renders product cards in an iframe widget
5. User clicks **Acquista** → Stripe hosted checkout opens in a new tab

## Setup

```bash
npm install
npm run dev
```

Server starts at `http://localhost:8787`.

## Connecting to ChatGPT

You need a public HTTPS URL. Use pay tunnel:

```bash
pay tunnel create --local localhost:8787 --allow-paths-matching="/mcp,/cancel,/success,/ui"
```

Then in ChatGPT:

1. Settings → Developer options → enable Developer mode
2. Create a new connector with `<your-tunnel-url>/mcp`
3. Add the connector to a chat
4. Ask: "Cercami un olio extra vergine"

## Important: Product Catalog

The server queries **Stripe Products** in your account. You need products created with:
- An active price (set as default_price)
- Optional metadata fields: `category` (classico/aromatizzato/dop/biologico/set), `size`

## Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest --server-url http://localhost:8787/mcp --transport http
```
