export type ExchangeVec3 = [number, number, number];
export type ExchangeTriangle = { a: ExchangeVec3; b: ExchangeVec3; c: ExchangeVec3; normal: ExchangeVec3 };

export type PrintPilotExchange = {
  format: "printpilot-configuration";
  version: 1;
  generatedAt: string;
  source: { fileName: string | null; fingerprint: string | null; kind: "stl" | "3mf" | "none"; orientationId: string };
  machine: { printer: string; nozzleMm: string };
  filament: Record<string, unknown>;
  criteria: Record<string, unknown>;
  geometry: Record<string, unknown> | null;
  imported3mf: Record<string, unknown> | null;
  recommendation: Record<string, unknown>;
  selectedDecisions: string[];
  printResult: Record<string, unknown>;
};

export function safeExchangeName(value: string | null | undefined) {
  return (value ?? "projet").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9À-ÿ_-]+/g, "_").replace(/^_+|_+$/g, "") || "projet";
}

export function binaryStl(name: string, triangles: ExchangeTriangle[]) {
  const bytes = new Uint8Array(84 + triangles.length * 50);
  const header = new TextEncoder().encode(`PrintPilot Hi · ${safeExchangeName(name)}`.slice(0, 80));
  bytes.set(header, 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((item, index) => {
    let offset = 84 + index * 50;
    [...item.normal, ...item.a, ...item.b, ...item.c].forEach(value => { view.setFloat32(offset, value, true); offset += 4; });
    view.setUint16(offset, 0, true);
  });
  return new Blob([bytes], { type: "model/stl" });
}

export function parsePrintPilotExchange(text: string): PrintPilotExchange {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("Le fichier JSON n’est pas valide."); }
  if (!value || typeof value !== "object") throw new Error("Ce fichier ne contient pas une configuration PrintPilot.");
  const candidate = value as Partial<PrintPilotExchange>;
  if (candidate.format !== "printpilot-configuration") throw new Error("Format non reconnu : choisis un export de configuration PrintPilot.");
  if (candidate.version !== 1) throw new Error(`Version PrintPilot non prise en charge : ${String(candidate.version ?? "inconnue")}.`);
  if (!candidate.machine || !candidate.criteria || !candidate.recommendation || !candidate.source) throw new Error("La configuration est incomplète.");
  if (!Array.isArray(candidate.selectedDecisions)) throw new Error("La liste des réglages à appliquer est absente.");
  return candidate as PrintPilotExchange;
}

export function agentPrompt(exchange: PrintPilotExchange) {
  const geometry = exchange.geometry ?? {};
  const recommendation = exchange.recommendation;
  const result = exchange.printResult;
  return `Tu es un expert en conception pour impression 3D FDM et en diagnostic d’impression.

Je vais joindre :
- le modèle 3D « ${exchange.source.fileName ?? "modèle non nommé"} » ;
- le fichier JSON PrintPilot contenant les réglages et critères ;
- éventuellement des photos du résultat et du défaut ;
- si disponible, le projet 3MF ou des captures de l’aperçu tranché.

Contexte synthétique :
- imprimante : ${exchange.machine.printer}, buse ${exchange.machine.nozzleMm} mm ;
- filament : ${String(exchange.filament.label ?? exchange.filament.family ?? "non renseigné")} ;
- dimensions analysées : ${JSON.stringify(geometry.sizeMm ?? "inconnues")} mm ;
- orientation PrintPilot : ${exchange.source.orientationId} ;
- recommandation : couche ${String(recommendation.layer ?? "?")}, ${String(recommendation.walls ?? "?")} parois, remplissage ${String(recommendation.infill ?? "?")}% ;
- résultat déclaré : ${String(result.outcome ?? "non renseigné")} ;
- défauts : ${String(result.defects ?? "aucun renseigné")} ;
- notes : ${String(result.notes ?? "aucune")}.

Analyse conjointement la géométrie, l’orientation, les photos et le JSON. Détermine si le problème vient principalement du modèle, de son orientation, du filament ou des réglages. Ne suppose pas que le slicer est responsable. Distingue clairement les faits observables, les hypothèses et les informations manquantes.

Contraintes :
- ne modifie aucune dimension fonctionnelle sans le signaler explicitement ;
- conserve les unités, l’échelle et l’usage prévu ;
- propose d’abord la correction ou le test minimal permettant d’isoler la cause ;
- évite de modifier plusieurs paramètres sensibles simultanément ;
- si une modification du STL est préférable, décris précisément la zone, la forme et les dimensions à modifier ;
- si des réglages doivent changer, donne un tableau « actuel / proposé / justification » ;
- indique ton niveau de confiance et les contrôles à effectuer dans l’aperçu du G-code.

Réponds avec : diagnostic principal, preuves, causes alternatives, modification géométrique éventuelle, réglages éventuels, test de validation, risques et informations manquantes.`;
}
