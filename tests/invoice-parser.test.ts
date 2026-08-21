import assert from "node:assert/strict";
import { extractInvoiceItems, extractInvoiceMetadata } from "../app/invoiceParser";

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

const bambuItems = extractInvoiceItems([
  "PETG Basic",
  "SKU: G00-K00-1.75-1000-SPL",
  "1 €26.21 €9.17 FR TVA(20%) €2.84 €17.04",
  "Variant: Noir(30105) / Filament",
  "avec bobine / 1 kg",
  "PETG Basic",
  "SKU: G00-W00-1.75-1000-SPL",
  "1 €26.21 €9.17 FR TVA(20%) €2.84 €17.04",
  "Variant: Blanc(30106) / Filament",
  "avec bobine / 1 kg",
  "Bambu Reusable Spool",
  "SKU: RSP001",
  "2 €14.11 €9.88 FR TVA(20%) €3.06 €18.34",
], "Bambu Lab");

assert.equal(bambuItems.length, 2);
assert.deepEqual(bambuItems.map(item => item.colorName), ["Noir", "Blanc"]);
assert.deepEqual(bambuItems.map(item => item.spoolWeightG), ["1000", "1000"]);
assert.deepEqual(bambuItems.map(item => item.unitPrice), ["17.04", "17.04"]);
assert.equal(bambuItems[0].productLine, "PETG Basic");

assert.deepEqual(extractInvoiceMetadata("INVOICE Invoice Number: BBLEU2612NE11DM66 Invoice Date: 2026-08-11 Items Subtotal €86.50 Shipping €0.00 Grand total €86.50"), {
  invoiceNumber: "BBLEU2612NE11DM66",
  purchaseDate: "2026-08-11",
  purchaseTotal: "86.50",
});
