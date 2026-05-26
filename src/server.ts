import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const PORT = parseInt(process.env.PORT ?? "8787", 10);
const SERVER_URL = process.env.SERVER_URL ?? `http://localhost:${PORT}`;

if (!STRIPE_KEY) {
  console.error("Error: STRIPE_SECRET_KEY is not set. Add it to .env or export it.");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY);

const TPLS = join(__dirname, "templates");
const productsHtml = readFileSync(join(TPLS, "products.html"), "utf-8");
const successHtml = readFileSync(join(TPLS, "success.html"), "utf-8");
const cancelHtml = readFileSync(join(TPLS, "cancel.html"), "utf-8");

const PRODUCTS_RESOURCE_URI = "ui://widget/olio-doro-products";

interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  size: string | null;
  image: string | null;
  priceId: string | null;
  unitAmount: number | null;
  currency: string | null;
}

async function fetchProducts(category?: string): Promise<Product[]> {
  const productList = await stripe.products.list({
    active: true,
    limit: 100,
    expand: ["data.default_price"],
  });

  return productList.data
    .filter((p) => !category || p.metadata.category === category)
    .map((product) => {
      const price =
        product.default_price && typeof product.default_price === "object"
          ? (product.default_price as { id: string; unit_amount: number | null; currency: string })
          : null;

      return {
        id: product.id,
        name: product.name,
        description: product.description ?? null,
        category: product.metadata.category ?? null,
        size: product.metadata.size ?? null,
        image: product.images?.[0] ?? null,
        priceId: price?.id ?? null,
        unitAmount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
      };
    })
    .filter((p) => p.priceId && p.unitAmount)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function scoreProduct(product: Product, query: string | undefined): number {
  const terms = query?.toLowerCase().split(/\s+/) ?? [];
  const haystack = [product.name, product.description ?? "", product.category ?? "", product.size ?? ""]
    .join(" ")
    .toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "olio-doro", version: "1.0.0" });

  registerAppResource(
    server,
    "olio-doro-products",
    PRODUCTS_RESOURCE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Catalogo prodotti Olio d'Oro con checkout Stripe integrato",
      _meta: {
        ui: {
          csp: {
            resourceDomains: [
              "https://fonts.googleapis.com",
              "https://fonts.gstatic.com",
              "https://*.stripe.com",
            ],
            connectDomains: ["https://*.stripe.com"],
          },
          prefersBorder: true,
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: PRODUCTS_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: productsHtml,
          _meta: {
            ui: {
              csp: {
                resourceDomains: [
                  "https://fonts.googleapis.com",
                  "https://fonts.gstatic.com",
                  "https://*.stripe.com",
                ],
                connectDomains: ["https://*.stripe.com"],
              },
              prefersBorder: true,
            },
            domain: SERVER_URL,
          },
        },
      ],
    })
  );

  registerAppTool(
    server,
    "search_products",
    {
      title: "Cerca prodotti",
      description:
        "Cerca prodotti Olio d'Oro per testo e categoria. Restituisce schede prodotto che l'utente può visualizzare e acquistare.",
      inputSchema: {
        query: z.string().optional().describe("Cosa cerca l'utente, es. 'olio tartufo', 'set degustazione', 'DOP toscano'"),
        category: z
          .enum(["classico", "aromatizzato", "dop", "biologico", "set"])
          .optional()
          .describe("Filtra per categoria di prodotto"),
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      _meta: {
        ui: {
          resourceUri: PRODUCTS_RESOURCE_URI,
          visibility: ["app", "model"],
        },
        "openai/toolInvocation/invoking": "Cercando prodotti…",
        "openai/toolInvocation/invoked": "Prodotti pronti",
      },
    },
    async ({ query, category }) => {
      const products = await fetchProducts(category);

      const results = products
        .map((p) => ({ product: p, score: scoreProduct(p, query) }))
        .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
        .slice(0, 9)
        .map((s) => s.product);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Nessun prodotto trovato per "${query}"${category ? ` nella categoria ${category}` : ""}. Prova con un altro termine.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Trovati ${results.length} prodotti per "${query}".`,
          },
        ],
        structuredContent: {
          products: results,
          query,
          category: category ?? null,
        },
      };
    }
  );

  registerAppTool(
    server,
    "checkout",
    {
      title: "Acquista prodotto",
      description:
        "Crea una sessione di pagamento Stripe per un prodotto e restituisce l'URL di pagamento sicuro.",
      inputSchema: {
        priceId: z.string().describe("ID del prezzo Stripe del prodotto da acquistare"),
        productName: z.string().describe("Nome leggibile del prodotto per conferma"),
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      _meta: {
        ui: {
          resourceUri: PRODUCTS_RESOURCE_URI,
          visibility: ["app", "model"],
        },
        "openai/toolInvocation/invoking": "Preparando il pagamento…",
        "openai/toolInvocation/invoked": "Sessione di pagamento pronta",
      },
    },
    async ({ priceId, productName }) => {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${SERVER_URL}/success`,
        cancel_url: `${SERVER_URL}/cancel`,
      });

      if (!session.url) {
        return {
          content: [{ type: "text" as const, text: "Errore: impossibile creare la sessione di pagamento." }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Sessione di pagamento creata per "${productName}". URL: ${session.url}`,
          },
        ],
        structuredContent: { url: session.url, productName },
      };
    }
  );

  return server;
}

const app = express();
app.use(cors());
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer();
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", (_req, res) => res.status(405).json({ error: "Method Not Allowed" }));
app.delete("/mcp", (_req, res) => res.status(405).json({ error: "Method Not Allowed" }));

app.get("/ui", (_req, res) => res.send(productsHtml));
app.get("/success", (_req, res) => res.send(successHtml));
app.get("/cancel", (_req, res) => res.send(cancelHtml));
app.get("/", (_req, res) => res.send("Olio d'Oro MCP server — POST /mcp"));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Olio d'Oro MCP server:  http://localhost:${PORT}/mcp`);
  console.log(`Product UI preview:     http://localhost:${PORT}/ui`);
  console.log(`Checkout success page:  http://localhost:${PORT}/success`);
});
