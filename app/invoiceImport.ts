"use client";

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type InvoiceDraft = {
  supplier: string;
  invoiceNumber: string;
  purchaseDate: string;
  purchaseTotal: string;
  brand: string;
  productLine: string;
  material: string;
  colorName: string;
  spoolWeightG: string;
  pricePerKg: string;
  extractedText: string;
  warnings: string[];
};

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function isoDate(raw: string) {
  const match = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function inferBrand(text: string) {
  return ["Bambu Lab", "Creality", "Polymaker", "PolyTerra", "eSUN", "SUNLU", "Prusament", "Elegoo", "Overture", "ColorFabb", "FormFutura"].find(brand => text.toLowerCase().includes(brand.toLowerCase())) ?? "";
}

function inferMaterial(text: string) {
  const upper = text.toUpperCase();
  if (/PLA\s*(WOOD|BOIS)/.test(upper)) return "PLA Wood";
  if (/PLA\s*MATTE/.test(upper)) return "PLA Matte";
  return ["PETG", "TPU", "ASA", "ABS", "PLA"].find(material => upper.includes(material)) ?? "Autre";
}

export async function readInvoicePdf(file: File): Promise<InvoiceDraft> {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: unknown) => item && typeof item === "object" && "str" in item ? String(item.str) : "").join(" "));
  }
  const text = pages.join("\n").replace(/\s+/g, " ").trim();
  if (text.length < 30) throw new Error("Ce PDF semble être une image scannée. L’OCR n’est pas encore disponible ; utilise une facture PDF contenant du texte.");
  const totalRaw = firstMatch(text, [/(?:total\s*(?:ttc)?|montant\s*(?:total)?)[^\d]{0,20}(\d+[.,]\d{2})\s*€/i, /€\s*(\d+[.,]\d{2})/i]);
  const weightKg = Number(firstMatch(text, [/(\d+(?:[.,]\d+)?)\s*kg/i]).replace(",", "."));
  const total = Number(totalRaw.replace(",", "."));
  const warnings: string[] = ["Vérifie les champs avant d’ajouter la bobine : la mise en page des factures varie selon le vendeur."];
  if (!totalRaw) warnings.push("Montant total non identifié.");
  return {
    supplier: inferBrand(text) || firstMatch(text, [/(?:vendeur|seller|fournisseur)\s*[:#-]?\s*([^\d]{3,45})/i]),
    invoiceNumber: firstMatch(text, [/(?:facture|invoice)\s*(?:n[°o.]?|number|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{3,})/i, /(?:commande|order)\s*(?:n[°o.]?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{3,})/i]),
    purchaseDate: isoDate(firstMatch(text, [/(?:date\s*(?:de\s*facture)?|invoice date)\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i, /(\d{1,2}[./-]\d{1,2}[./-]\d{4})/])),
    purchaseTotal: totalRaw.replace(",", "."),
    brand: inferBrand(text),
    productLine: firstMatch(text, [/((?:PLA|PETG|TPU|ASA|ABS)[^€]{0,55})/i]),
    material: inferMaterial(text),
    colorName: firstMatch(text, [/(?:couleur|color)\s*[:#-]?\s*([A-Za-zÀ-ÿ -]{3,28})/i]),
    spoolWeightG: weightKg ? String(Math.round(weightKg * 1000)) : "1000",
    pricePerKg: total > 0 && weightKg > 0 ? (total / weightKg).toFixed(2) : "",
    extractedText: text,
    warnings,
  };
}
