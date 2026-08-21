"use client";

import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { extractInvoiceItems, extractInvoiceMetadata, inferBrand, inferMaterial, type InvoiceItemDraft } from "./invoiceParser";

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
  items: InvoiceItemDraft[];
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

export async function readInvoicePdf(file: File): Promise<InvoiceDraft> {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [], invoiceLines: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const positioned = content.items.flatMap((item: unknown) => item && typeof item === "object" && "str" in item && "transform" in item
      ? [{ text: String(item.str), x: Number((item.transform as number[])[4]), y: Number((item.transform as number[])[5]) }] : []);
    const rows = new Map<number, Array<{ text: string; x: number }>>();
    positioned.forEach(item => { const y = Math.round(item.y / 3) * 3; rows.set(y, [...(rows.get(y) ?? []), { text: item.text, x: item.x }]); });
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => items.sort((a, b) => a.x - b.x).map(item => item.text).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
    invoiceLines.push(...lines); pages.push(lines.join("\n"));
  }
  const text = pages.join("\n").replace(/\s+/g, " ").trim();
  if (text.length < 30) throw new Error("Ce PDF semble être une image scannée. L’OCR n’est pas encore disponible ; utilise une facture PDF contenant du texte.");
  const metadata = extractInvoiceMetadata(text), totalRaw = metadata.purchaseTotal;
  const weightKg = Number(firstMatch(text, [/(\d+(?:[.,]\d+)?)\s*kg/i]).replace(",", "."));
  const total = Number(totalRaw.replace(",", "."));
  const warnings: string[] = ["Vérifie les champs avant d’ajouter la bobine : la mise en page des factures varie selon le vendeur."];
  if (!totalRaw) warnings.push("Montant total non identifié.");
  const detectedBrand = inferBrand(text);
  const items = extractInvoiceItems(invoiceLines, detectedBrand);
  if (items.length < 2) warnings.push("Une seule ligne produit a été reconnue. Tu peux ajouter manuellement les lignes manquantes avant l’import.");
  return {
    supplier: detectedBrand || firstMatch(text, [/(?:vendeur|seller|fournisseur)\s*[:#-]?\s*([^\d]{3,45})/i]),
    invoiceNumber: metadata.invoiceNumber,
    purchaseDate: metadata.purchaseDate,
    purchaseTotal: metadata.purchaseTotal,
    brand: inferBrand(text),
    productLine: firstMatch(text, [/((?:PLA|PETG|TPU|ASA|ABS)[^€]{0,55})/i]),
    material: inferMaterial(text),
    colorName: firstMatch(text, [/(?:couleur|color)\s*[:#-]?\s*([A-Za-zÀ-ÿ -]{3,28})/i]),
    spoolWeightG: weightKg ? String(Math.round(weightKg * 1000)) : "",
    pricePerKg: total > 0 && weightKg > 0 ? (total / weightKg).toFixed(2) : "",
    extractedText: text,
    items,
    warnings,
  };
}
