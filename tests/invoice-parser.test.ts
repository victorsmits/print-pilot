import assert from "node:assert/strict";
import { extractInvoiceItems } from "../app/invoiceParser";

const items = extractInvoiceItems([
  "Bambu Lab PLA Basic Color: Noir 1 kg Qty 2 24,99 €",
  "Bambu Lab PETG Basic Couleur: Blanc 1000 g x 1 19,90 €",
  "Livraison 4,99 €",
], "Bambu Lab");

assert.equal(items.length, 2);
assert.equal(items[0].quantity, "2");
assert.equal(items[0].material, "PLA");
assert.equal(items[0].colorName, "Noir");
assert.equal(items[0].spoolWeightG, "1000");
assert.equal(items[0].pricePerKg, "24.99");
assert.equal(items[1].material, "PETG");
assert.equal(items[1].colorName, "Blanc");
assert.equal(items[1].quantity, "1");

console.log("Invoice parser: plusieurs lignes et quantités détectées");
