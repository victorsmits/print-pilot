export type InvoiceItemDraft = {
  id: string;
  selected: boolean;
  quantity: string;
  brand: string;
  productLine: string;
  material: string;
  colorName: string;
  spoolWeightG: string;
  unitPrice: string;
  pricePerKg: string;
  sourceLine: string;
};

const MATERIAL_PATTERN = /\b(PLA\s*(?:WOOD|BOIS|MATTE)?|PETG|TPU|ASA|ABS)\b/i;
const BRANDS = ["Bambu Lab", "Creality", "Polymaker", "PolyTerra", "eSUN", "SUNLU", "Prusament", "Elegoo", "Overture", "ColorFabb", "FormFutura"];

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function isoDate(raw: string) {
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const match = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function extractInvoiceMetadata(text: string) {
  const purchaseTotal = firstMatch(text, [/(?:grand\s+total|net\s+payment|total\s*ttc|montant\s+total)[^€\d]{0,30}(?:€\s*)?(\d+[.,]\d{2})/i, /(?:total\s*(?:ttc)?|montant\s*(?:total)?)[^\d]{0,20}(\d+[.,]\d{2})\s*€/i, /€\s*(\d+[.,]\d{2})/i]).replace(",", ".");
  const invoiceNumber = firstMatch(text, [/(?:invoice|facture)\s*(?:number|n[°o.]?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{3,})/i, /(?:commande|order)\s*(?:number|n[°o.]?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{3,})/i]);
  const purchaseDate = isoDate(firstMatch(text, [/(?:date\s*(?:de\s*facture)?|invoice date)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i, /(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})/]));
  return { invoiceNumber, purchaseDate, purchaseTotal };
}

export function inferBrand(text: string) {
  return BRANDS.find(brand => text.toLowerCase().includes(brand.toLowerCase())) ?? "";
}

export function inferMaterial(text: string) {
  const upper = text.toUpperCase();
  if (/PLA\s*(WOOD|BOIS)/.test(upper)) return "PLA Wood";
  if (/PLA\s*MATTE/.test(upper)) return "PLA Matte";
  return ["PETG", "TPU", "ASA", "ABS", "PLA"].find(material => upper.includes(material)) ?? "Autre";
}

function decimal(raw: string) {
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

function quantityFrom(line: string) {
  const match = line.match(/(?:\bq(?:t[ée]|ty)\.?\s*[:x]?\s*|\bx\s*)(\d{1,2})\b/i)
    ?? line.match(/^\s*(\d{1,2})\s*[x×]\s+/i)
    ?? line.match(/(?:^|\s)(\d{1,2})\s+€\s*\d+[.,]\d{2}/i);
  return match?.[1] ?? "1";
}

function weightFrom(line: string) {
  const match = line.match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
  if (!match) return "";
  const value = decimal(match[1]);
  return String(Math.round(match[2].toLowerCase() === "kg" ? value * 1000 : value));
}

function unitPriceFrom(line: string) {
  const prices = [...line.matchAll(/(?:€\s*)?(\d{1,4}[.,]\d{2})(?:\s*€)?/g)].map(match => decimal(match[1])).filter(value => value > 0);
  return prices.length ? prices[prices.length - 1].toFixed(2) : "";
}

function explicitColor(line: string) {
  const explicit = line.match(/(?:couleur|color|colour)\s*[:#-]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ -]{1,28}?)(?=\s+(?:\d+[.,]\d{2}|\d+\s*(?:kg|g)|qty|qt[ée]|x\d)|$)/i)?.[1]?.trim();
  if (explicit) return explicit;
  const variant = line.match(/Variant\s*:\s*(.+?)(?:\s*\/|\s+Filament\b|$)/i)?.[1]?.replace(/\s*\(\d+\)\s*$/, "").trim();
  return variant ?? "";
}

export function extractInvoiceItems(lines: string[], invoiceBrand = ""): InvoiceItemDraft[] {
  const normalized = lines.map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const skuHeaders = normalized.flatMap((line, index) => /^SKU\s*:/i.test(normalized[index + 1] ?? "") ? [index] : []);
  const headers = skuHeaders.length ? skuHeaders : normalized.flatMap((line, index) => line.length >= 4 && MATERIAL_PATTERN.test(line) ? [index] : []);
  return headers.flatMap((start, position) => {
    const productLine = normalized[start], end = headers[position + 1] ?? normalized.length;
    if (!MATERIAL_PATTERN.test(productLine)) return [];
    const line = normalized.slice(start, end).join(" ");
    const spoolWeightG = weightFrom(line), unitPrice = unitPriceFrom(line);
    const weightKg = decimal(spoolWeightG) / 1000;
    return [{
      id: `invoice-${position}`,
      selected: true,
      quantity: quantityFrom(line),
      brand: inferBrand(line) || invoiceBrand,
      productLine: productLine.slice(0, 100),
      material: inferMaterial(productLine),
      colorName: explicitColor(line),
      spoolWeightG,
      unitPrice,
      pricePerKg: unitPrice && weightKg > 0 ? (decimal(unitPrice) / weightKg).toFixed(2) : "",
      sourceLine: line,
    }];
  });
}
