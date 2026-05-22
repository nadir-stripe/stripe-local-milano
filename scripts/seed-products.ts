import "dotenv/config";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const products = [
  {
    name: "Olio Extra Vergine Classico",
    description: "Il nostro olio più venduto. Spremitura a freddo da olive Frantoio e Leccino raccolte a mano in Toscana.",
    metadata: { category: "classico", size: "500ml" },
    price: 2400,
  },
  {
    name: "Olio al Tartufo Nero",
    description: "Extra vergine infuso con tartufo nero pregiato del Périgord. Ideale per risotti e bruschette.",
    metadata: { category: "aromatizzato", size: "250ml" },
    price: 3800,
  },
  {
    name: "Olio DOP Toscano",
    description: "Denominazione di Origine Protetta. Blend di Moraiolo, Frantoio e Leccino. Fruttato intenso con note di carciofo.",
    metadata: { category: "dop", size: "750ml" },
    price: 4500,
  },
  {
    name: "Set Degustazione Premium",
    description: "Tre oli selezionati: Classico, DOP Toscano e Tartufo Nero. Confezione regalo in legno d'ulivo.",
    metadata: { category: "set", size: "3 x 100ml" },
    price: 3200,
  },
  {
    name: "Olio Biologico Monocultivar",
    description: "100% olive Coratina da agricoltura biologica certificata. Sapore deciso con retrogusto piccante.",
    metadata: { category: "biologico", size: "500ml" },
    price: 2900,
  },
  {
    name: "Olio al Peperoncino Calabrese",
    description: "Extra vergine con infusione naturale di peperoncino calabrese. Per chi ama il piccante autentico.",
    metadata: { category: "aromatizzato", size: "250ml" },
    price: 1800,
  },
  {
    name: "Olio al Limone di Amalfi",
    description: "Delicato olio aromatizzato con scorza di limone della Costiera Amalfitana. Perfetto per pesce e insalate.",
    metadata: { category: "aromatizzato", size: "250ml" },
    price: 2200,
  },
  {
    name: "Gran Riserva Centenaria",
    description: "Edizione limitata da ulivi centenari. Solo 500 bottiglie prodotte. Fruttato medio-intenso, equilibrato.",
    metadata: { category: "dop", size: "500ml" },
    price: 8500,
  },
];

async function seed() {
  console.log("Seeding products in Stripe...\n");

  for (const p of products) {
    const product = await stripe.products.create({
      name: p.name,
      description: p.description,
      metadata: p.metadata,
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: p.price,
      currency: "eur",
    });

    await stripe.products.update(product.id, {
      default_price: price.id,
    });

    console.log(`  ✓ ${p.name} — €${(p.price / 100).toFixed(2)} (${product.id})`);
  }

  console.log("\nDone! Products are ready for the MCP server.");
}

seed().catch((err) => {
  console.error("Error seeding:", err.message);
  process.exit(1);
});
