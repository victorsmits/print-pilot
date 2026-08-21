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
    ?? line.match(/^\s*(\d{1,2})\s*[x×]\s+/i);
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
  return line.match(/(?:couleur|color|colour)\s*[:#-]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ -]{1,28}?)(?=\s+(?:\d+[.,]\d{2}|\d+\s*(?:kg|g)|qty|qt[ée]|x\d)|$)/i)?.[1]?.trim() ?? "";
}

export function extractInvoiceItems(lines: string[], invoiceBrand = ""): InvoiceItemDraft[] {
  const candidates = lines.map(line => line.replace(/\s+/g, " ").trim()).filter(line => line.length >= 4 && MATERIAL_PATTERN.test(line));
  return candidates.map((line, index) => {
    const spoolWeightG = weightFrom(line);
    const unitPrice = unitPriceFrom(line);
    const weightKg = decimal(spoolWeightG) / 1000;
    return {
      id: `invoice-${index}`,
      selected: true,
      quantity: quantityFrom(line),
      brand: inferBrand(line) || invoiceBrand,
      productLine: line.replace(/(?:€\s*)?\d{1,4}[.,]\d{2}(?:\s*€)?/g, "").replace(/\s+/g, " ").trim().slice(0, 100),
      material: inferMaterial(line),
      colorName: explicitColor(line),
      spoolWeightG,
      unitPrice,
      pricePerKg: unitPrice && weightKg > 0 ? (decimal(unitPrice) / weightKg).toFixed(2) : "",
      sourceLine: line,
    };
  });
}
