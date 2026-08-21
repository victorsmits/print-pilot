"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import AccountPanel from "./AccountPanel";
import InventoryPanel from "./InventoryPanel";
import PrintHistoryPanel, { type PrintRun } from "./PrintHistoryPanel";
import { buildCrealityProject, type ExportDecision } from "./threeMfExport";
import { read3mfProject, settingString, type Imported3mfProject } from "./threeMfImport";
import { agentPrompt, binaryStl, parsePrintPilotExchange, safeExchangeName, type PrintPilotExchange } from "./diagnosticExchange";

type Vec3 = [number, number, number];
type Triangle = { a: Vec3; b: Vec3; c: Vec3; normal: Vec3; area: number };
type MeshStats = {
  name: string;
  triangles: Triangle[];
  size: Vec3;
  volumeCm3: number;
  surfaceAreaMm2: number;
  overhangPercent: number;
  overhangAreaMm2: number;
  baseScore: number;
  orientation: string;
  orientationNote: string;
};

const FILAMENTS = [
  { id: "pla-basic-noir", label: "Bambu PLA Basic · Noir", family: "PLA", note: "Polyvalent, facile et précis." },
  { id: "pla-basic-jade", label: "Bambu PLA Basic · Blanc jade", family: "PLA", note: "Polyvalent, marques de surface plus visibles." },
  { id: "pla-basic-beige", label: "Bambu PLA Basic · Beige", family: "PLA", note: "Polyvalent, bon pour les objets décoratifs." },
  { id: "pla-matte-blanc", label: "Bambu PLA Matte · Blanc cassé", family: "PLA Matte", note: "Très beau rendu, détails fins un peu adoucis." },
  { id: "pla-matte-vert", label: "Bambu PLA Matte · Vert foncé", family: "PLA Matte", note: "Rendu mat, privilégier une vitesse modérée." },
  { id: "pla-matte-bleu", label: "Bambu PLA Matte · Bleu foncé", family: "PLA Matte", note: "Rendu mat, privilégier une vitesse modérée." },
  { id: "pla-matte-brun", label: "Bambu PLA Matte · Brun désert", family: "PLA Matte", note: "Rendu mat, bon pour le coffret et la déco." },
  { id: "pla-matte-terre", label: "Bambu PLA Matte · Terre cuite", family: "PLA Matte", note: "Rendu mat, bon pour les objets décoratifs." },
  { id: "petg-basic", label: "Bambu PETG Basic · Blanc", family: "PETG", note: "Humidité et usage extérieur ; ponts plus délicats." },
  { id: "pla-wood", label: "Bambu PLA Wood · Palissandre", family: "PLA Wood", note: "Aspect bois ; débit prudent et buse 0,6 mm conseillée." },
];

export type InventoryFilament = {
  id: string;
  dbId?: number;
  label: string;
  family: string;
  note: string;
  brand?: string;
  productLine?: string;
  colorName?: string;
  colorHex?: string | null;
  spoolWeightG?: number | null;
  remainingG?: number | null;
  pricePerKg?: number | null;
  supplier?: string | null;
  purchaseDate?: string | null;
  invoiceNumber?: string | null;
  purchaseTotal?: number | null;
  purchaseQuantity?: number | null;
  cfsSlot?: string | null;
  nozzleDiameter?: number | null;
  lastDriedAt?: string | null;
  lotNumber?: string | null;
  openedAt?: string | null;
  storageLocation?: string | null;
  storageHumidity?: number | null;
  profileName?: string | null;
  nozzleTempMin?: number | null;
  nozzleTempMax?: number | null;
  bedTempMin?: number | null;
  bedTempMax?: number | null;
  maxVolumetricSpeed?: number | null;
  flowRatio?: number | null;
  pressureAdvance?: number | null;
  dryingTemp?: number | null;
  dryingHours?: number | null;
  cfsCompatible?: boolean;
  abrasive?: boolean;
  calibrated?: boolean;
  notes?: string | null;
};

const PROFILE_BASES: Record<string, { top: number; bottom: number; outer: number; inner: number; infill: number; topSpeed: number; acceleration: number }> = {
  "0,08 mm": { top: 10, bottom: 7, outer: 230, inner: 250, infill: 250, topSpeed: 180, acceleration: 4000 },
  "0,12 mm": { top: 5, bottom: 5, outer: 150, inner: 350, infill: 400, topSpeed: 200, acceleration: 6000 },
  "0,16 mm": { top: 6, bottom: 4, outer: 150, inner: 300, infill: 250, topSpeed: 200, acceleration: 6000 },
  "0,20 mm": { top: 5, bottom: 3, outer: 150, inner: 300, infill: 270, topSpeed: 200, acceleration: 6000 },
  "0,24 mm": { top: 4, bottom: 3, outer: 150, inner: 250, infill: 250, topSpeed: 200, acceleration: 6000 },
  "0,28 mm": { top: 4, bottom: 3, outer: 150, inner: 250, infill: 200, topSpeed: 200, acceleration: 6000 },
};

const USES = [
  { id: "decor", title: "Décoratif", subtitle: "Aspect et surfaces" },
  { id: "functional", title: "Fonctionnel", subtitle: "Efforts et durée" },
  { id: "fit", title: "Ajustement", subtitle: "Jeux et précision" },
  { id: "outdoor", title: "Extérieur", subtitle: "UV et humidité" },
  { id: "container", title: "Contenant", subtitle: "Étanchéité relative" },
  { id: "prototype", title: "Prototype", subtitle: "Rapide et économique" },
];

const PROJECT_PRESETS = [
  { id: "toy", title: "Jouet", subtitle: "Solide, manipulé, aspect soigné", useCase: "functional", secondaryUses: ["decor"], priority: "balance", precision: "standard", visibleTop: true, loadDirection: "multi", environment: "inside", exposure: "normal", shapeClass: "organic", featureSize: "fine", fitType: "none", supportAccess: "easy", undersideFinish: "standard" },
  { id: "decor", title: "Décoration", subtitle: "Finition et détails visibles", useCase: "decor", secondaryUses: [], priority: "quality", precision: "fine", visibleTop: true, loadDirection: "faible", environment: "inside", exposure: "normal", shapeClass: "organic", featureSize: "fine", fitType: "none", supportAccess: "delicate", undersideFinish: "clean" },
  { id: "plant", title: "Pot / plante", subtitle: "Humidité, contenant ou arrosage", useCase: "container", secondaryUses: ["outdoor"], priority: "balance", precision: "standard", visibleTop: true, loadDirection: "faible", environment: "humid", exposure: "water", shapeClass: "prismatic", featureSize: "normal", fitType: "none", supportAccess: "easy", undersideFinish: "standard" },
  { id: "storage", title: "Boîte / rangement", subtitle: "Fonctionnel et relativement rigide", useCase: "functional", secondaryUses: ["container"], priority: "balance", precision: "standard", visibleTop: false, loadDirection: "xy", environment: "inside", exposure: "normal", shapeClass: "prismatic", featureSize: "normal", fitType: "none", supportAccess: "easy", undersideFinish: "standard" },
  { id: "mechanical", title: "Pièce fonctionnelle", subtitle: "Résistance avant esthétique", useCase: "functional", secondaryUses: [], priority: "strength", precision: "standard", visibleTop: false, loadDirection: "multi", environment: "inside", exposure: "normal", shapeClass: "prismatic", featureSize: "normal", fitType: "none", supportAccess: "easy", undersideFinish: "removal" },
  { id: "prototype", title: "Prototype rapide", subtitle: "Validation de forme économique", useCase: "prototype", secondaryUses: [], priority: "speed", precision: "rough", visibleTop: false, loadDirection: "faible", environment: "inside", exposure: "normal", shapeClass: "prismatic", featureSize: "normal", fitType: "none", supportAccess: "easy", undersideFinish: "removal" },
] as const;

const SETTINGS_HELP = {
  layer: {
    title: "Hauteur de couche", path: "Processus › Qualité › Hauteur de couche",
    detail: "Le profil sélectionné donne la base. Ce champ permet ensuite une surcharge globale ou par objet.", image: "/tutorial/layer-height.png",
    caption: "Le champ « Hauteur de couche » est le premier bloc de Qualité.",
    steps: ["Sélectionne Global, ou Objet si tu ne veux modifier qu’une pièce.", "Passe l’affichage des paramètres en mode Avancé.", "Ouvre Qualité, puis Hauteur de couche.", "Si le bloc reste caché, clique la loupe et recherche « Hauteur de couche »."],
  },
  walls: {
    title: "Nombre de parois", path: "Processus › Solidité › Nombre de parois",
    detail: "Dans l’interface anglaise de certaines captures, le même champ s’appelle « Wall loops ».", image: "/tutorial/wall-loops.png",
    caption: "Capture réelle : section Wall/Parois de Creality Print.",
    steps: ["Ouvre Processus puis Solidité.", "Déplie le bloc Parois.", "Modifie « Nombre de parois » ; 3 à 4 est notre plage habituelle.", "Tranche et vérifie que les petits détails conservent assez d’espace intérieur."],
  },
  infill: {
    title: "Densité de remplissage", path: "Processus › Solidité › Densité de remplissage",
    detail: "Le motif se règle juste sous la densité. Les parois comptent souvent davantage que beaucoup de remplissage.", image: "/tutorial/infill-density.png",
    caption: "Capture réelle : bloc Remplissage/Infill de Creality Print.",
    steps: ["Ouvre Processus puis Solidité.", "Descends jusqu’au bloc Remplissage.", "Règle « Densité de remplissage » puis le motif.", "Contrôle dans l’aperçu que le remplissage soutient bien les surfaces supérieures."],
  },
  supports: {
    title: "Activer les supports", path: "Processus › Support › Activer les supports",
    detail: "Le type, l’angle de seuil et les distances de contact se trouvent dans ce même onglet.", image: "/tutorial/enable-support.png", secondaryImage: "/tutorial/support-advanced.png",
    caption: "Capture réelle : activation et paramètres du panneau Support.",
    steps: ["Ouvre Processus puis Support et coche « Activer les supports ».", "Choisis Normaux (auto) ou Arborescents (auto) selon le conseil.", "Règle l’Angle de seuil, puis « Sur plateau uniquement » et « Ne supporter que les régions critiques ».", "En mode Avancé, règle Distance Z supérieure, Distance support/objet XY et les couches d’interface.", "Après tranchage, cherche les îlots et vérifie chaque contact support/pièce couche par couche."],
  },
  brim: {
    title: "Type de bordure", path: "Processus › Support › Type de bordure",
    detail: "La catégorie a changé entre certaines versions. L’app cible Creality Print 7.2 ; la recherche par libellé reste le chemin le plus robuste.", image: "/tutorial/brim-type.png",
    caption: "Capture réelle d’une version antérieure : le champ et ses choix sont identiques, mais sa catégorie peut différer.",
    steps: ["Dans Processus, clique la loupe.", "Recherche exactement « Type de bordure ».", "Choisis Auto, Oreilles de souris, Bordure extérieure ou Aucune bordure.", "Ajuste ensuite Largeur de la bordure et l’écart bordure/objet si nécessaire."],
  },
  ironing: {
    title: "Type de lissage", path: "Processus › Qualité › Type de lissage",
    detail: "Le lissage n’apparaît qu’en mode Avancé. La capture montre le contrôle indispensable dans l’aperçu G-code.", image: "/tutorial/ironing-type.png",
    caption: "Capture réelle : la ligne « Ironing/Lissage » doit apparaître après tranchage.",
    steps: ["Passe les paramètres en mode Avancé.", "Dans Processus, clique la loupe et recherche « Type de lissage ».", "Choisis Toutes les surfaces supérieures ou Surface la plus haute uniquement.", "Règle ensuite Motif, Vitesse, Débit et Espacement avec les valeurs de ta carte de calibration.", "Tranche : dans Aperçu › Type de ligne, vérifie que Lissage apparaît bien."],
  },
  texture: {
    title: "Peau floue / texturage", path: "Processus › Autres › Peau floue",
    detail: "La peau floue déplace légèrement la trajectoire de la paroi extérieure. Elle masque les lignes et ajoute du grip, mais peut modifier les cotes et les petits détails.", image: "/tutorial/fuzzy-skin.png",
    caption: "Capture réelle de Creality Print : passe en Avancé puis utilise la loupe du panneau Traitement pour rechercher « Peau floue ».",
    steps: ["Passe le panneau Traitement en mode Avancé.", "Clique la loupe à droite du profil et recherche « Peau floue » ou « Fuzzy Skin ».", "Pour une texture globale sûre, choisis uniquement les parois extérieures.", "Reporte l’épaisseur et la distance des points indiquées par PrintPilot ; laisse la première couche désactivée.", "Pour une zone localisée, sélectionne le modèle puis utilise l’outil de peinture Peau floue dans la barre de gauche.", "Tranche et examine les parois externes : aucun trou, filetage ou face d’ajustement ne doit être texturé."],
  },
  filament: {
    title: "Profil de filament", path: "Préparer › Filament › Modifier le profil",
    detail: "Le profil de matière porte notamment les températures, le débit volumique maximal, le ratio de débit et le pressure advance.", image: "/tutorial/filament-profile.png",
    caption: "Capture réelle : fenêtre de gestion des matériaux de Creality Print.",
    steps: ["Dans Préparer, repère le bloc Filament au-dessus de la liste des objets.", "Ouvre le menu de la bobine puis l’édition/gestion des filaments.", "Duplique un profil système avant de modifier ses valeurs.", "Reporte uniquement les valeurs connues de ta fiche PrintPilot, puis donne un nom explicite au profil."],
  },
};
type HelpKey = keyof typeof SETTINGS_HELP;

const CRITERIA_HELP = {
  visibleTop: { title: "Face supérieure visible", text: "Une surface orientée vers le haut que l’on verra pendant l’usage normal : dessus d’un couvercle, tablette, plaque avec texte ou sommet plat d’une boîte.", decide: "Coche Oui si l’aspect du dessus compte. Laisse Non si le dessus est caché, interne, sous une autre pièce ou sans importance esthétique." },
  loadDirection: { title: "Direction de l’effort", text: "Indique dans quel sens la pièce sera tirée, pliée ou serrée. Une pièce est généralement plus fragile entre les couches, donc dans l’axe Z.", decide: "Imagine la force principale en service. Si elle cherche à séparer les couches, choisis Z ; si elle agit dans une couche, choisis XY." },
  priority: { title: "Priorité du projet", text: "Détermine le compromis dominant entre état de surface, durée d’impression, quantité de matière et résistance.", decide: "Choisis ce qui ferait échouer le projet : une surface médiocre, un délai trop long ou une pièce trop faible." },
  precision: { title: "Précision souhaitée", text: "Concerne la finesse des couches et la restitution des petits détails, pas la précision absolue d’un trou ou d’un assemblage.", decide: "Fine pour texte et courbes visibles ; Standard pour la majorité des pièces ; Large pour un brouillon rapide." },
  shapeClass: { title: "Forme globale", text: "Décrit la famille géométrique du modèle et aide à choisir le type de support, l’adhérence et les vitesses prudentes.", decide: "Choisis la forme dominante. Une boîte reste prismatique même si ses arêtes sont arrondies ; une figurine est organique." },
  featureSize: { title: "Plus petit détail", text: "C’est la plus petite nervure, pointe, lettre, paroi ou rainure que tu souhaites réellement conserver.", decide: "Mesure dans la CAO si possible. Sous 0,6 mm, une buse de 0,4 mm peut ne déposer qu’une seule ligne ou supprimer le détail." },
  environment: { title: "Environnement", text: "L’humidité, la température ambiante et l’exposition extérieure changent le choix du matériau avant même les réglages du slicer.", decide: "Choisis la situation la plus sévère que la pièce rencontrera régulièrement." },
  exposure: { title: "Exposition particulière", text: "Précise le risque dominant : eau durable, chaleur ou UV. Le PLA peut ramollir à chaud et vieillir dehors.", decide: "Pense à l’usage réel : voiture au soleil = chaleur ; balcon = UV et humidité." },
  fitType: { title: "Type d’ajustement", text: "Indique si deux pièces doivent coulisser, se clipser, être serrées ou si un trou doit respecter une cote.", decide: "Si une autre pièce doit entrer dedans ou dessus, choisis l’ajustement le plus proche et prévois une éprouvette de jeu." },
  supportAccess: { title: "Accès aux supports", text: "Décrit la facilité avec laquelle une pince ou les doigts pourront atteindre les supports après impression.", decide: "Une zone sous une figurine est accessible ; un tunnel fermé ou l’intérieur d’une cavité profonde ne l’est pas." },
  undersideFinish: { title: "Qualité du dessous", text: "Une face imprimée sur support est généralement plus rugueuse. Une interface dense l’améliore, mais colle davantage.", decide: "Demande une face propre seulement si elle restera visible ou doit s’ajuster à une autre pièce." },
  textureIntent: { title: "Texturage extérieur", text: "La peau floue crée volontairement de petites irrégularités sur les parois. Elle peut donner un aspect mat, pierre ou antidérapant, mais elle modifie légèrement la surface réelle.", decide: "Conserve le réglage si tu n’en as pas besoin. Utilise une texture globale seulement sur un objet décoratif ou une poignée sans cote précise ; choisis la peinture localisée si certaines zones doivent rester lisses." },
} as const;
type CriteriaHelpKey = keyof typeof CRITERIA_HELP;

function sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a: Vec3, b: Vec3) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function length(v: Vec3) { return Math.sqrt(dot(v, v)); }
function normalize(v: Vec3): Vec3 { const l = length(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function triangle(a: Vec3, b: Vec3, c: Vec3): Triangle { const cp = cross(sub(b, a), sub(c, a)); return { a, b, c, normal: normalize(cp), area: length(cp) / 2 }; }

function parseSTL(buffer: ArrayBuffer): Triangle[] {
  const view = new DataView(buffer);
  const expected = buffer.byteLength >= 84 ? 84 + view.getUint32(80, true) * 50 : -1;
  if (expected === buffer.byteLength) {
    const count = view.getUint32(80, true), tris: Triangle[] = [];
    for (let i = 0; i < count; i++) {
      const o = 84 + i * 50 + 12;
      const read = (n: number): Vec3 => [view.getFloat32(o + n * 12, true), view.getFloat32(o + n * 12 + 4, true), view.getFloat32(o + n * 12 + 8, true)];
      tris.push(triangle(read(0), read(1), read(2)));
    }
    return tris;
  }
  const text = new TextDecoder().decode(buffer);
  const values = [...text.matchAll(/vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g)].map(m => [Number(m[1]), Number(m[2]), Number(m[3])] as Vec3);
  const tris: Triangle[] = [];
  for (let i = 0; i + 2 < values.length; i += 3) tris.push(triangle(values[i], values[i + 1], values[i + 2]));
  return tris;
}

function geometryForAxis(triangles: Triangle[], axis: 0 | 1 | 2, sign: 1 | -1) {
  const mins: Vec3 = [Infinity, Infinity, Infinity], maxs: Vec3 = [-Infinity, -Infinity, -Infinity];
  triangles.forEach(item => [item.a, item.b, item.c].forEach(vertex => vertex.forEach((value, index) => {
    mins[index] = Math.min(mins[index], value);
    maxs[index] = Math.max(maxs[index], value);
  })));
  const bed = sign === 1 ? mins[axis] : maxs[axis];
  const tolerance = Math.max(0.08, (maxs[axis] - mins[axis]) * 0.002);
  const totalArea = triangles.reduce((s, t) => s + t.area, 0) || 1;
  const supportNormalLimit = -Math.cos(30 * Math.PI / 180);
  const supportArea = triangles.reduce((sum, t) => {
    const liesOnBed = [t.a[axis], t.b[axis], t.c[axis]].every(value => Math.abs(value - bed) <= tolerance);
    const facesDown = t.normal[axis] * sign < supportNormalLimit;
    return sum + (!liesOnBed && facesDown ? t.area : 0);
  }, 0);
  const bedArea = triangles.reduce((s, t) => {
    const touches = [t.a[axis], t.b[axis], t.c[axis]].every(v => Math.abs(v - bed) <= tolerance);
    return s + (touches ? t.area * Math.abs(t.normal[axis]) : 0);
  }, 0);
  const other = ([0, 1, 2] as const).filter(i => i !== axis);
  const footprint = Math.max(1, (maxs[other[0]] - mins[other[0]]) * (maxs[other[1]] - mins[other[1]]));
  return { axis, sign, support: supportArea / totalArea * 100, supportArea, base: Math.min(100, bedArea / footprint * 100), height: maxs[axis] - mins[axis] };
}

export function analyseMesh(name: string, triangles: Triangle[]): MeshStats {
  if (!triangles.length) throw new Error("Le fichier ne contient aucun triangle exploitable.");
  const rawSignedVolume = triangles.reduce((s, t) => s + dot(t.a, cross(t.b, t.c)) / 6, 0);
  const orientedTriangles = rawSignedVolume < 0 ? triangles.map(t => triangle(t.a, t.c, t.b)) : triangles;
  const mins: Vec3 = [Infinity, Infinity, Infinity], maxs: Vec3 = [-Infinity, -Infinity, -Infinity];
  orientedTriangles.forEach(item => [item.a, item.b, item.c].forEach(vertex => vertex.forEach((value, index) => {
    mins[index] = Math.min(mins[index], value);
    maxs[index] = Math.max(maxs[index], value);
  })));
  const size: Vec3 = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
  const signedVolume = orientedTriangles.reduce((s, t) => s + dot(t.a, cross(t.b, t.c)) / 6, 0);
  const surfaceAreaMm2 = orientedTriangles.reduce((sum, t) => sum + t.area, 0);
  const candidates = ([0, 1, 2] as const).flatMap(axis => [geometryForAxis(orientedTriangles, axis, 1), geometryForAxis(orientedTriangles, axis, -1)]);
  candidates.sort((a, b) => (a.support + a.height / 100 - a.base * 0.12) - (b.support + b.height / 100 - b.base * 0.12));
  const current = geometryForAxis(orientedTriangles, 2, 1), best = candidates[0], labels = ["X", "Y", "Z"];
  const orientation = best.axis === 2 && best.sign === 1 ? "Orientation actuelle" : `${best.sign === -1 ? "Retourner puis " : ""}poser l’axe ${labels[best.axis]}`;
  const gain = Math.max(0, current.support - best.support);
  return { name, triangles: orientedTriangles, size, volumeCm3: Math.abs(signedVolume) / 1000, surfaceAreaMm2, overhangPercent: current.support, overhangAreaMm2: current.supportArea, baseScore: current.base, orientation, orientationNote: gain > 2 ? `Estimation : environ ${gain.toFixed(1)} points de surface à supporter en moins.` : "Le Z minimum du STL est posé sur le plateau ; cette orientation est déjà proche du meilleur compromis détecté." };
}

const ORIENTATIONS = [
  { id: "current", label: "Actuelle", rotate: ([x, y, z]: Vec3): Vec3 => [x, y, z] },
  { id: "x-plus", label: "Côté X", rotate: ([x, y, z]: Vec3): Vec3 => [x, -z, y] },
  { id: "x-minus", label: "Côté X opposé", rotate: ([x, y, z]: Vec3): Vec3 => [x, z, -y] },
  { id: "y-plus", label: "Côté Y", rotate: ([x, y, z]: Vec3): Vec3 => [z, y, -x] },
  { id: "y-minus", label: "Côté Y opposé", rotate: ([x, y, z]: Vec3): Vec3 => [-z, y, x] },
  { id: "upside-down", label: "Retournée", rotate: ([x, y, z]: Vec3): Vec3 => [x, -y, -z] },
] as const;

function rotateTriangles(triangles: Triangle[], orientationId: string) {
  const orientation = ORIENTATIONS.find(item => item.id === orientationId) ?? ORIENTATIONS[0];
  return triangles.map(item => triangle(orientation.rotate(item.a), orientation.rotate(item.b), orientation.rotate(item.c)));
}

export function minimumTriangleZ(triangles: Triangle[]) {
  let minZ = Infinity;
  triangles.forEach(item => { minZ = Math.min(minZ, item.a[2], item.b[2], item.c[2]); });
  return minZ;
}

function fmt(n: number, digits = 0) { return Number.isFinite(n) ? n.toFixed(digits).replace(".", ",") : "—"; }

async function fileFingerprint(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function ModelCanvas({ stats, compact = false }: { stats: MeshStats | null; compact?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const viewer = useRef({
    reset: () => undefined,
    setView: () => undefined as void,
    zoom: () => undefined as void,
    fitPlate: () => undefined,
  } as { reset: () => void; setView: (view: "iso" | "top" | "front" | "side") => void; zoom: (factor: number) => void; fitPlate: () => void });
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !stats) return;
    canvas.parentElement?.classList.remove("webgl-failed");
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" }); }
    catch { canvas.parentElement?.classList.add("webgl-failed"); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x18201b, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(stats.triangles.length * 9);
    const normals = new Float32Array(stats.triangles.length * 9);
    const colors = new Float32Array(stats.triangles.length * 9);
    let minZ = Infinity;
    stats.triangles.forEach((item, index) => {
      minZ = Math.min(minZ, item.a[2], item.b[2], item.c[2]);
      const offset = index * 9, vertices = [item.a, item.b, item.c];
      vertices.forEach((vertex, vertexIndex) => {
        positions.set(vertex, offset + vertexIndex * 3);
        normals.set(item.normal, offset + vertexIndex * 3);
      });
    });
    const bedTolerance = Math.max(0.08, stats.size[2] * 0.002);
    stats.triangles.forEach((item, index) => {
      const onBed = [item.a[2], item.b[2], item.c[2]].every(value => Math.abs(value - minZ) <= bedTolerance);
      const danger = !onBed && item.normal[2] < -Math.cos(30 * Math.PI / 180);
      const color = danger ? new THREE.Color(0xef7f32) : new THREE.Color(0x35d77d);
      const offset = index * 9;
      for (let vertex = 0; vertex < 3; vertex += 1) colors.set(color.toArray(), offset + vertex * 3);
    });
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const bounds = geometry.boundingBox!, center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(1, geometry.boundingSphere?.radius ?? 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, shininess: 28, specular: 0x4a6d59, flatShading: true }));
    scene.add(mesh);

    const bedCenter = new THREE.Vector3(center.x, center.y, minZ - 0.12);
    const bedGeometry = new THREE.PlaneGeometry(260, 260);
    const bed = new THREE.Mesh(bedGeometry, new THREE.MeshBasicMaterial({ color: 0x101713, side: THREE.DoubleSide, depthWrite: true }));
    bed.position.copy(bedCenter); scene.add(bed);
    const grid = new THREE.GridHelper(260, 26, 0x6f8375, 0x334039);
    grid.rotation.x = Math.PI / 2; grid.position.set(bedCenter.x, bedCenter.y, minZ - 0.05);
    const gridMaterial = grid.material as THREE.LineBasicMaterial; gridMaterial.transparent = true; gridMaterial.opacity = 0.82;
    scene.add(grid);
    const border = new THREE.LineSegments(new THREE.EdgesGeometry(bedGeometry), new THREE.LineBasicMaterial({ color: 0x91a79a }));
    border.position.set(bedCenter.x, bedCenter.y, minZ - 0.03); scene.add(border);
    const axisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(bedCenter.x - 130, bedCenter.y, minZ), new THREE.Vector3(bedCenter.x + 130, bedCenter.y, minZ),
      new THREE.Vector3(bedCenter.x, bedCenter.y - 130, minZ), new THREE.Vector3(bedCenter.x, bedCenter.y + 130, minZ),
    ]);
    const axes = new THREE.LineSegments(axisGeometry, new THREE.LineBasicMaterial({ color: 0xa7b8ad, transparent: true, opacity: 0.72 })); scene.add(axes);

    scene.add(new THREE.HemisphereLight(0xe4fff0, 0x101713, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2); keyLight.position.set(center.x + radius * 2, center.y - radius * 2, center.z + radius * 4); scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x76dca1, 1.25); fillLight.position.set(center.x - radius * 3, center.y + radius, center.z + radius); scene.add(fillLight);

    const viewHeight = Math.max(12, radius * 2.55);
    const camera = new THREE.OrthographicCamera(-viewHeight, viewHeight, viewHeight, -viewHeight, 0.1, Math.max(3000, radius * 20));
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false; controls.screenSpacePanning = true; controls.minZoom = 0.08; controls.maxZoom = 20;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const distance = Math.max(100, radius * 6);
    const applyView = (view: "iso" | "top" | "front" | "side", resetZoom = true) => {
      camera.up.set(0, 0, 1);
      if (view === "top") { camera.position.set(center.x, center.y, center.z + distance); camera.up.set(0, 1, 0); }
      else if (view === "front") camera.position.set(center.x, center.y - distance, center.z);
      else if (view === "side") camera.position.set(center.x + distance, center.y, center.z);
      else camera.position.set(center.x + distance * .72, center.y - distance * .72, center.z + distance * .58);
      controls.target.copy(center); if (resetZoom) camera.zoom = 1; camera.lookAt(center); camera.updateProjectionMatrix(); controls.update(); render();
    };
    const resize = () => {
      const box = canvas.getBoundingClientRect(), width = Math.max(1, box.width), height = Math.max(1, box.height), aspect = width / height;
      renderer.setSize(width, height, false);
      camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2; camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix(); render();
    };
    viewer.current = {
      reset: () => applyView("iso"),
      setView: view => applyView(view),
      zoom: factor => { camera.zoom = Math.min(20, Math.max(0.08, camera.zoom * factor)); camera.updateProjectionMatrix(); render(); },
      fitPlate: () => { applyView("top", false); camera.zoom = Math.min(1, viewHeight / 286); camera.updateProjectionMatrix(); render(); },
    };
    applyView("iso");
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    return () => {
      observer.disconnect(); controls.removeEventListener("change", render); controls.dispose();
      scene.traverse(object => {
        const disposable = object as THREE.Mesh | THREE.LineSegments;
        disposable.geometry?.dispose();
        const material = disposable.material;
        if (Array.isArray(material)) material.forEach(item => item.dispose()); else material?.dispose();
      });
      renderer.dispose();
      viewer.current = { reset: () => undefined, setView: () => undefined, zoom: () => undefined, fitPlate: () => undefined };
    };
  }, [stats]);
  return <div className={`model-viewer ${compact ? "compact" : ""}`}>
    <canvas ref={ref} className="model-canvas" onDoubleClick={() => viewer.current.reset()} onContextMenu={event => event.preventDefault()} aria-label="Aperçu WebGL manipulable du modèle 3D" />
    {!stats && <div className="viewer-empty"><b>APERÇU DU MODÈLE</b><span>Importe un STL pour commencer</span></div>}
    {stats && <><div className="viewer-empty viewer-error"><b>VIEWER INDISPONIBLE</b><span>WebGL n’est pas disponible dans ce navigateur.</span></div><div className="bed-label">PLATEAU HI · 260 × 260 MM</div><div className="viewer-toolbar viewer-views"><button onClick={() => viewer.current.setView("iso")}>ISO</button><button onClick={() => viewer.current.setView("top")}>DESSUS</button><button onClick={() => viewer.current.setView("front")}>FACE</button><button onClick={() => viewer.current.setView("side")}>CÔTÉ</button></div><div className="viewer-toolbar viewer-zoom"><button onClick={() => viewer.current.zoom(1 / 1.25)} aria-label="Dézoomer">−</button><button onClick={() => viewer.current.reset()} aria-label="Recentrer le modèle">⌂</button><button onClick={() => viewer.current.fitPlate()} aria-label="Afficher tout le plateau">▦</button><button onClick={() => viewer.current.zoom(1.25)} aria-label="Zoomer">+</button></div>{!compact && <span className="viewer-help">Glisser : tourner · Clic droit : déplacer · Molette/pincer : zoomer · ▦ : plateau entier</span>}</>}
  </div>;
}

function TutorialPanel({ item, onClose }: { item: HelpKey | null; onClose: () => void }) {
  if (!item) return null; const help = SETTINGS_HELP[item];
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="tutorial-drawer" onMouseDown={e => e.stopPropagation()} aria-modal="true" role="dialog">
    <div className="drawer-head"><div><span className="eyebrow">TUTO CONTEXTUEL</span><h2>{help.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer">×</button></div>
    <div className="breadcrumb">{help.path}</div><p>{help.detail}</p>
    <ol className="tutorial-steps">{help.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
    <figure className="real-tutorial-shot"><img src={help.image} alt={`Capture réelle de Creality Print montrant ${help.title}`} /><figcaption><span>CREALITY PRINT · CAPTURE RÉELLE</span><b>{help.caption}</b></figcaption></figure>
    {"secondaryImage" in help && <figure className="real-tutorial-shot secondary-shot"><img src={help.secondaryImage} alt="Vue détaillée du panneau de paramètres Creality Print" /><figcaption><span>VUE DÉTAILLÉE</span><b>Les libellés français exacts sont indiqués dans les étapes ci-dessus.</b></figcaption></figure>}
    <div className="tip"><b>Contrôle final</b><span>Après le tranchage, ouvre l’aperçu couche par couche. Vérifie les îlots, les ponts et le départ des surplombs.</span></div><button className="primary full" onClick={onClose}>J’ai trouvé le réglage</button>
  </aside></div>;
}

function Setting({ icon, label, value, onHelp }: { icon: string; label: string; value: string; onHelp: () => void }) { return <div className="setting"><span className="setting-icon">{icon}</span><span><small>{label}</small><b>{value}</b></span><button onClick={onHelp}>Où régler ?</button></div>; }

function InfoTip({ item }: { item: CriteriaHelpKey }) {
  const help = CRITERIA_HELP[item];
  return <details className="info-tip" onClick={event => event.stopPropagation()}><summary aria-label={`Explication : ${help.title}`}>i</summary><div><b>{help.title}</b><p>{help.text}</p><span>Comment choisir</span><p>{help.decide}</p></div></details>;
}

function InfoLabel({ children, item }: { children: string; item: CriteriaHelpKey }) { return <span className="info-label">{children}<InfoTip item={item}/></span>; }

export type AccountUser = { displayName: string; email: string } | null;

export default function PrintPilotClient({ user, authError = null }: { user: AccountUser; authError?: string | null }) {
  const [mesh, setMesh] = useState<MeshStats | null>(null), [fileState, setFileState] = useState<"idle" | "loading" | "error">("idle"), [error, setError] = useState(""), [step, setStep] = useState(1);
  const [useCase, setUseCase] = useState("functional"), [secondaryUses, setSecondaryUses] = useState<string[]>([]), [priority, setPriority] = useState("balance"), [precision, setPrecision] = useState("standard"), [visibleTop, setVisibleTop] = useState(true), [loadDirection, setLoadDirection] = useState("faible");
  const [environment, setEnvironment] = useState("inside"), [fitType, setFitType] = useState("none"), [supportAccess, setSupportAccess] = useState("easy"), [exposure, setExposure] = useState("normal");
  const [shapeClass, setShapeClass] = useState("prismatic"), [undersideFinish, setUndersideFinish] = useState("standard"), [featureSize, setFeatureSize] = useState("normal"), [textureIntent, setTextureIntent] = useState("preserve"), [nozzle, setNozzle] = useState("0.4");
  const [filamentId, setFilamentId] = useState(FILAMENTS[0].id), [printer, setPrinter] = useState("hi"), [mode, setMode] = useState<"balanced" | "quality" | "fast">("balanced"), [tutorial, setTutorial] = useState<HelpKey | null>(null);
  const [inventory, setInventory] = useState<InventoryFilament[]>(FILAMENTS), [inventoryOpen, setInventoryOpen] = useState(false), [inventoryLoading, setInventoryLoading] = useState(false), [accountOpen, setAccountOpen] = useState(false), [exportStatus, setExportStatus] = useState("");
  const [appliedPreset, setAppliedPreset] = useState(""), [slicedHours, setSlicedHours] = useState(""), [slicedMinutes, setSlicedMinutes] = useState(""), [slicedGrams, setSlicedGrams] = useState(""), [electricityPrice, setElectricityPrice] = useState("0.30"), [averagePower, setAveragePower] = useState("120");
  const [imported3mf, setImported3mf] = useState<Imported3mfProject | null>(null), [sourceTriangles, setSourceTriangles] = useState<Triangle[]>([]), [orientationId, setOrientationId] = useState("current");
  const [selectedDecisions, setSelectedDecisions] = useState<ExportDecision[]>(["layer", "walls", "shells", "infill", "support", "brim", "ironing"]);
  const [exportReceipt, setExportReceipt] = useState<Array<{ key: string; expected: string; actual: string | null; declared: boolean }> | null>(null);
  const [experienceMode, setExperienceMode] = useState<"guided" | "expert">("guided"), [historyOpen, setHistoryOpen] = useState(false), [historyLoading, setHistoryLoading] = useState(false), [prints, setPrints] = useState<PrintRun[]>([]);
  const [outcome, setOutcome] = useState<"success" | "mixed" | "failed">("success"), [qualityRating, setQualityRating] = useState(4), [defects, setDefects] = useState(""), [printNotes, setPrintNotes] = useState(""), [printStatus, setPrintStatus] = useState("");
  const [sourceFingerprint, setSourceFingerprint] = useState<string | null>(null), [exchangeStatus, setExchangeStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null), configInputRef = useRef<HTMLInputElement>(null), filament = inventory.find(f => f.id === filamentId) ?? inventory[0] ?? FILAMENTS[0];

  async function reloadPrints() {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/prints", { cache: "no-store" });
      const payload = await response.json() as { prints?: PrintRun[] };
      if (response.ok && payload.prints) setPrints(payload.prints);
    } finally { setHistoryLoading(false); }
  }

  async function reloadInventory() {
    if (!user) return;
    setInventoryLoading(true);
    try {
      const response = await fetch("/api/filaments", { cache: "no-store" });
      const payload = await response.json() as { filaments?: Array<Record<string, unknown>> };
      if (response.ok && payload.filaments) {
        const rows = payload.filaments.map(row => ({
          ...row, id: `db-${row.id}`, dbId: Number(row.id),
          label: `${row.brand} ${row.productLine} · ${row.colorName}`,
          family: String(row.material), note: row.calibrated ? "Profil calibré" : String(row.notes ?? "À calibrer"),
        } as InventoryFilament));
        setInventory(rows);
        if (rows.length && !rows.some(row => row.id === filamentId)) setFilamentId(rows[0].id);
      }
    } finally { setInventoryLoading(false); }
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetch("/api/filaments", { cache: "no-store" })
      .then(async response => ({ ok: response.ok, payload: await response.json() as { filaments?: Array<Record<string, unknown>> } }))
      .then(({ ok, payload }) => {
        if (!active || !ok || !payload.filaments) return;
        const rows = payload.filaments.map(row => ({
          ...row, id: `db-${row.id}`, dbId: Number(row.id),
          label: `${row.brand} ${row.productLine} · ${row.colorName}`,
          family: String(row.material), note: row.calibrated ? "Profil calibré" : String(row.notes ?? "À calibrer"),
        } as InventoryFilament));
        setInventory(rows);
        setFilamentId(current => rows.length && !rows.some(row => row.id === current) ? rows[0].id : current);
      })
      .catch(() => { /* Le catalogue local reste disponible hors ligne. */ });
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    fetch("/api/prints", { cache: "no-store" }).then(async response => ({ ok: response.ok, payload: await response.json() as { prints?: PrintRun[] } })).then(({ ok, payload }) => {
      if (active && ok && payload.prints) setPrints(payload.prints);
    }).catch(() => { /* L’historique reste simplement vide hors ligne. */ });
    return () => { active = false; };
  }, [user]);

  function changeExperienceMode(value: "guided" | "expert") {
    setExperienceMode(value);
  }
  function choosePrimaryUse(id: string) {
    setUseCase(id);
    setSecondaryUses(current => current.filter(value => value !== id));
  }
  function toggleSecondaryUse(id: string) {
    if (id === useCase) return;
    setSecondaryUses(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 2 ? [...current, id] : current);
  }
  function applyProjectPreset(preset: (typeof PROJECT_PRESETS)[number]) {
    setUseCase(preset.useCase);
    setSecondaryUses([...preset.secondaryUses]);
    setPriority(preset.priority);
    setPrecision(preset.precision);
    setVisibleTop(preset.visibleTop);
    setLoadDirection(preset.loadDirection);
    setEnvironment(preset.environment);
    setExposure(preset.exposure);
    setShapeClass(preset.shapeClass);
    setFeatureSize(preset.featureSize);
    setFitType(preset.fitType);
    setSupportAccess(preset.supportAccess);
    setUndersideFinish(preset.undersideFinish);
    setAppliedPreset(preset.id);
  }
  function chooseTextureIntent(value: string) {
    setTextureIntent(value);
    setSelectedDecisions(current => {
      const withoutTexture = current.filter(item => item !== "texture");
      const globalChoice = ["none", "fine", "medium", "grip"].includes(value);
      const blocked = value !== "none" && (fitType !== "none" || featureSize === "micro");
      return globalChoice && !blocked ? [...withoutTexture, "texture"] : withoutTexture;
    });
  }
  const recommendation = useMemo(() => {
    const activeUses = new Set([useCase, ...secondaryUses]);
    const quality = mode === "quality" || priority === "quality" || precision === "fine" || (useCase === "decor" && mode !== "fast"), fast = mode === "fast" || priority === "speed" || useCase === "prototype";
    let layer = quality ? "0,12 mm" : fast ? "0,24 mm" : "0,20 mm"; if (precision === "fine" && mode === "quality") layer = "0,08 mm"; if (precision === "rough" && mode === "fast") layer = "0,28 mm";
    if (featureSize === "micro" && nozzle === "0.4" && mode !== "fast") layer = "0,08 mm";
    if (nozzle === "0.6" && (layer === "0,08 mm" || layer === "0,12 mm")) layer = quality ? "0,16 mm" : "0,20 mm";
    let walls = activeUses.has("functional") || priority === "strength" || activeUses.has("container") ? 4 : 3; if (mode === "fast") walls = Math.max(2, walls - 1);
    const infill = priority === "strength" || activeUses.has("functional") ? 25 : activeUses.has("container") ? 18 : fast ? 10 : 15, pattern = priority === "strength" ? "Gyroïde" : "Cubique adaptatif", supportRatio = mesh?.overhangPercent ?? 0;
    const base = PROFILE_BASES[layer] ?? PROFILE_BASES["0,20 mm"], layerMm = Number(layer.slice(0, 4).replace(",", "."));
    const supportsEnabled = Boolean(mesh && supportRatio >= 2 && mesh.overhangAreaMm2 >= 35);
    const treeSupport = shapeClass === "organic" || shapeClass === "tall";
    const supportType = treeSupport ? "Arborescents (auto)" : "Normaux (auto)";
    const supportStyle = treeSupport ? "Arborescents Organiques" : shapeClass === "broad" ? "Ajusté" : "Défaut";
    const supportThreshold = undersideFinish === "clean" ? 40 : supportAccess === "closed" ? 20 : 30;
    const supportOnPlateOnly = supportsEnabled && shapeClass !== "cavity" && supportAccess !== "closed" && supportRatio < 15;
    const supportCriticalOnly = supportsEnabled && supportRatio < 11 && undersideFinish !== "clean" && shapeClass !== "broad";
    const contactLayers = undersideFinish === "clean" ? 4 : supportAccess === "easy" ? 3 : 2;
    const topZLayers = filament.family === "PETG" || supportAccess === "closed" ? 2 : 1;
    const topZ = Math.max(layerMm, layerMm * topZLayers);
    const supportXY = filament.family === "PETG" ? 0.45 : undersideFinish === "clean" ? 0.30 : 0.35;
    const interfaceSpacing = undersideFinish === "clean" ? 0.25 : 0.5;
    const support = supportsEnabled ? `${supportType} · ${supportThreshold}°` : "Désactivés";
    const supportPlan = { enabled: supportsEnabled, type: supportType, style: supportStyle, threshold: supportThreshold, onPlateOnly: supportOnPlateOnly, criticalOnly: supportCriticalOnly, topZ, xy: supportXY, interfaceLayers: contactLayers, interfaceSpacing };
    const brim = mesh && (mesh.baseScore < 7 || Math.max(...mesh.size) / Math.max(1, Math.min(...mesh.size.filter(v => v > 0))) > 5) ? "Bordure 5 mm" : "Auto / aucune";
    const ironing = visibleTop && (activeUses.has("decor") || priority === "quality") ? "Toutes les surfaces supérieures" : "Désactivé", cautions: string[] = [];
    const texturePresets: Record<string, { label: string; action: "preserve" | "disable" | "global" | "localized"; fuzzySkin: "none" | "external"; thickness: number | null; pointDistance: number | null; firstLayer: boolean }> = {
      preserve: { label: "Conserver le réglage existant", action: "preserve", fuzzySkin: "none", thickness: null, pointDistance: null, firstLayer: false },
      none: { label: "Désactivée", action: "disable", fuzzySkin: "none", thickness: null, pointDistance: null, firstLayer: false },
      fine: { label: "Fine · extérieur · 0,12 / 0,80 mm", action: "global", fuzzySkin: "external", thickness: 0.12, pointDistance: 0.8, firstLayer: false },
      medium: { label: "Moyenne · extérieur · 0,20 / 0,60 mm", action: "global", fuzzySkin: "external", thickness: 0.2, pointDistance: 0.6, firstLayer: false },
      grip: { label: "Grip · extérieur · 0,30 / 0,50 mm", action: "global", fuzzySkin: "external", thickness: 0.3, pointDistance: 0.5, firstLayer: false },
      localized: { label: "Peinture localisée manuelle", action: "localized", fuzzySkin: "none", thickness: null, pointDistance: null, firstLayer: false },
    };
    let texture = texturePresets[textureIntent] ?? texturePresets.preserve;
    if (texture.action === "global" && (fitType !== "none" || featureSize === "micro")) {
      texture = { ...texture, action: "localized", label: "Globale bloquée · utiliser la peinture localisée" };
      cautions.push("La texture globale est bloquée : une cote d’ajustement ou un détail inférieur à 0,6 mm doit rester lisse. Peins uniquement les zones décoratives dans Creality Print.");
    }
    if (filament.family === "PETG") cautions.push("Le PETG file davantage et tolère moins bien les ponts : ralentir les ponts et sécher la bobine.");
    if (filament.family === "PLA Wood") cautions.push("Buse 0,6 mm conseillée ; éviter les très petites couches et surveiller le débit.");
    if ((activeUses.has("outdoor") || environment === "outside" || exposure === "water") && filament.family.startsWith("PLA")) cautions.push("Pour l’extérieur ou l’humidité durable, ce PLA n’est pas le meilleur choix : préfère le PETG de ton inventaire.");
    if (exposure === "heat" && filament.family.startsWith("PLA")) cautions.push("Risque thermique : le PLA peut se déformer dans une voiture, près d’une source chaude ou en plein soleil.");
    if (activeUses.has("fit") && fitType === "none") cautions.push("L’usage Ajustement est sélectionné : précise le type d’ajustement pour affiner le conseil.");
    if (fitType !== "none") cautions.push("L’ajustement ne peut pas être garanti par une valeur universelle : imprime une petite éprouvette de jeu avant la pièce finale.");
    if (supportAccess === "closed" && supportRatio >= 2) cautions.push("Les supports seraient difficiles à retirer dans cette cavité : privilégie une autre orientation ou sépare la pièce.");
    if (shapeClass === "cavity") cautions.push(supportsEnabled ? "Une cavité fermée peut emprisonner les supports. Vérifie leur chemin de retrait ou coupe temporairement la pièce pour l’impression." : "La forme indique une cavité, mais elle n’active pas automatiquement les supports : vérifie les îlots après tranchage.");
    if (shapeClass === "broad" && !supportsEnabled) cautions.push("Un large dessous plat posé sur le plateau n’a pas besoin de support ; surveille surtout l’adhérence et le gauchissement.");
    if (undersideFinish === "clean" && supportsEnabled) cautions.push("Une face inférieure propre exige une interface plus dense, mais elle peut devenir plus difficile à détacher : imprime un coupon de contact si la face est critique.");
    if (nozzle === "0.6") cautions.push("Les profils officiels détaillés affichés ci-dessous sont ceux de la buse 0,4 mm. La hauteur est adaptée, mais les vitesses doivent être validées avec ton profil 0,6 mm.");
    if (!filament.calibrated) cautions.push("Cette bobine n’est pas marquée comme calibrée : débit, pressure advance et débit volumique maximal restent à confirmer.");
    if (printer !== "hi") cautions.push("L’imprimante active n’est pas la Creality Hi : les profils et limites peuvent être incorrects.");
    if (mesh && mesh.overhangPercent > 10) cautions.push("Beaucoup de faces descendantes détectées : tester l’orientation proposée avant d’ajouter des supports.");
    if (texture.action === "global" && (activeUses.has("container") || exposure === "water")) cautions.push("La peau floue reste extérieure, mais évite-la sur les portées de joint, zones collées ou surfaces devant rester faciles à nettoyer.");
    return { layer, walls, infill, pattern, support, supportPlan, brim, ironing, texture, cautions, base };
  }, [mode, priority, precision, useCase, secondaryUses, mesh, visibleTop, filament, printer, environment, exposure, fitType, supportAccess, shapeClass, undersideFinish, featureSize, textureIntent, nozzle]);
  const effectiveSelectedDecisions = useMemo<ExportDecision[]>(() =>
    recommendation.texture.action === "preserve" || recommendation.texture.action === "localized"
      ? selectedDecisions.filter(item => item !== "texture")
      : selectedDecisions,
  [recommendation.texture.action, selectedDecisions]);
  const slicedCost = useMemo(() => {
    const hours = Math.max(0, Number(slicedHours.replace(",", ".")) || 0) + Math.max(0, Number(slicedMinutes.replace(",", ".")) || 0) / 60;
    const grams = Math.max(0, Number(slicedGrams.replace(",", ".")) || 0);
    const kwhPrice = Math.max(0, Number(electricityPrice.replace(",", ".")) || 0);
    const powerW = Math.max(0, Number(averagePower.replace(",", ".")) || 0);
    const materialCost = grams > 0 && filament.pricePerKg != null ? grams * filament.pricePerKg / 1000 : null;
    const energyCost = hours > 0 ? hours * powerW / 1000 * kwhPrice : null;
    const totalCost = materialCost != null && energyCost != null ? materialCost + energyCost : null;
    return { hours, grams, materialCost, energyCost, totalCost };
  }, [slicedHours, slicedMinutes, slicedGrams, electricityPrice, averagePower, filament.pricePerKg]);
  const exchangeConfiguration = useMemo<PrintPilotExchange>(() => ({
    format: "printpilot-configuration",
    version: 1,
    generatedAt: new Date().toISOString(),
    source: { fileName: mesh?.name ?? null, fingerprint: sourceFingerprint, kind: imported3mf ? "3mf" : mesh ? "stl" : "none", orientationId },
    machine: { printer: printer === "hi" ? "Creality Hi" : "Creality K2 / autre", nozzleMm: nozzle },
    filament: {
      id: filament.id, label: filament.label, family: filament.family, brand: filament.brand ?? null, productLine: filament.productLine ?? null,
      colorName: filament.colorName ?? null, profileName: filament.profileName ?? null, nozzleTempMin: filament.nozzleTempMin ?? null, nozzleTempMax: filament.nozzleTempMax ?? null,
      bedTempMin: filament.bedTempMin ?? null, bedTempMax: filament.bedTempMax ?? null, maxVolumetricSpeed: filament.maxVolumetricSpeed ?? null,
      flowRatio: filament.flowRatio ?? null, pressureAdvance: filament.pressureAdvance ?? null, calibrated: Boolean(filament.calibrated), abrasive: Boolean(filament.abrasive),
    },
    criteria: { useCase, secondaryUses, priority, precision, visibleTop, loadDirection, environment, fitType, supportAccess, exposure, shapeClass, undersideFinish, featureSize, textureIntent, mode, appliedPreset },
    geometry: mesh ? { sizeMm: mesh.size, triangleCount: mesh.triangles.length, volumeCm3: mesh.volumeCm3, surfaceAreaMm2: mesh.surfaceAreaMm2, overhangPercent: mesh.overhangPercent, overhangAreaMm2: mesh.overhangAreaMm2, baseScore: mesh.baseScore, orientation: mesh.orientation, orientationNote: mesh.orientationNote } : null,
    imported3mf: imported3mf ? { printerProfile: imported3mf.printerProfile, processProfile: imported3mf.processProfile, filamentProfiles: imported3mf.filamentProfiles, objectCount: imported3mf.objectCount, plateCount: imported3mf.plateCount, projectSettings: imported3mf.projectSettings } : null,
    recommendation: { ...recommendation },
    selectedDecisions: effectiveSelectedDecisions,
    printResult: { outcome, qualityRating, defects, notes: printNotes, slicedHours, slicedMinutes, slicedGrams, electricityPricePerKwh: electricityPrice, averagePowerW: averagePower, materialCost: slicedCost.materialCost, energyCost: slicedCost.energyCost, totalCost: slicedCost.totalCost },
  }), [mesh, sourceFingerprint, imported3mf, orientationId, printer, nozzle, filament, useCase, secondaryUses, priority, precision, visibleTop, loadDirection, environment, fitType, supportAccess, exposure, shapeClass, undersideFinish, featureSize, textureIntent, mode, appliedPreset, recommendation, effectiveSelectedDecisions, outcome, qualityRating, defects, printNotes, slicedHours, slicedMinutes, slicedGrams, electricityPrice, averagePower, slicedCost]);
  const promptForAgent = useMemo(() => agentPrompt(exchangeConfiguration), [exchangeConfiguration]);
  const orientationChoices = useMemo(() => {
    if (!sourceTriangles.length || (imported3mf?.plateCount ?? 1) > 1) return [];
    const step = Math.max(1, Math.ceil(sourceTriangles.length / 50000));
    const analysisTriangles = step === 1 ? sourceTriangles : sourceTriangles.filter((_, index) => index % step === 0);
    return ORIENTATIONS.map(item => {
      const stats = analyseMesh(mesh?.name ?? "modèle", rotateTriangles(analysisTriangles, item.id));
      const score = stats.overhangPercent + stats.size[2] / 100 - stats.baseScore * 0.12;
      return { ...item, stats, score };
    }).sort((a, b) => a.score - b.score);
  }, [sourceTriangles, imported3mf?.plateCount, mesh?.name]);
  const comparisonRows = useMemo(() => {
    const config = imported3mf?.projectSettings ?? {};
    const current = (key: string, fallback = "Non défini") => settingString(config, key) ?? (imported3mf ? fallback : "Profil officiel");
    const rows: Array<{ id: ExportDecision; label: string; current: string; recommended: string; disabled?: boolean }> = [
      { id: "layer", label: "Hauteur de couche", current: current("layer_height"), recommended: recommendation.layer.replace(",", ".") },
      { id: "walls", label: "Parois", current: current("wall_loops"), recommended: String(recommendation.walls) },
      { id: "shells", label: "Dessus / dessous", current: `${current("top_shell_layers")} / ${current("bottom_shell_layers")}`, recommended: `${recommendation.base.top} / ${recommendation.base.bottom}` },
      { id: "infill", label: "Remplissage", current: `${current("sparse_infill_density")} · ${current("sparse_infill_pattern")}`, recommended: `${recommendation.infill}% · ${recommendation.pattern}` },
      { id: "support", label: "Supports", current: current("enable_support", "Désactivés") === "1" ? "Activés" : "Désactivés", recommended: recommendation.supportPlan.enabled ? recommendation.support : "Désactivés" },
      { id: "brim", label: "Bordure", current: current("brim_type"), recommended: recommendation.brim },
      { id: "ironing", label: "Lissage", current: current("ironing_type", "Désactivé"), recommended: recommendation.ironing },
      { id: "texture", label: "Texturage", current: current("fuzzy_skin", "Non modifié"), recommended: recommendation.texture.label, disabled: recommendation.texture.action === "preserve" || recommendation.texture.action === "localized" },
    ];
    return experienceMode === "expert" ? rows : rows.filter(row => !imported3mf || row.current.toLowerCase() !== row.recommended.toLowerCase());
  }, [imported3mf, recommendation, experienceMode]);
  const successfulWithFilament = prints.filter(run => run.outcome === "success" && (filament.dbId == null || run.filamentId === filament.dbId)).length;
  const exportAudit = [
    { label: "Profil / couche", value: recommendation.layer, reason: "Choisi selon précision et priorité" },
    { label: "Parois", value: `${recommendation.walls}`, reason: "Adaptées aux usages sélectionnés" },
    { label: "Remplissage", value: `${recommendation.infill}% · ${recommendation.pattern}`, reason: "Compromis usage / résistance" },
    { label: "Supports", value: recommendation.supportPlan.enabled ? recommendation.support : "Désactivés", reason: "Décision issue du STL orienté" },
    ...(recommendation.brim.startsWith("Bordure") ? [{ label: "Bordure", value: recommendation.brim, reason: "Contact plateau jugé insuffisant" }] : []),
    ...(recommendation.ironing !== "Désactivé" ? [{ label: "Lissage", value: recommendation.ironing, reason: "Dessus visible et finition prioritaire" }] : []),
    ...(recommendation.texture.action !== "preserve" ? [{ label: "Texturage", value: recommendation.texture.label, reason: recommendation.texture.action === "localized" ? "À peindre manuellement sur la géométrie" : "Choix explicite de l’utilisateur" }] : []),
  ];
  function exportProject() {
    if (!mesh) { setExportStatus("Importe d’abord un STL : le 3MF doit contenir une géométrie."); setStep(1); return; }
    if (nozzle !== "0.4") { setExportStatus("L’export exact est disponible pour la buse 0,4 mm. Le profil officiel 0,6 mm sera ajouté ensuite."); return; }
    try {
      const project = buildCrealityProject({
        modelName: mesh.name,
        triangles: mesh.triangles,
        nozzle,
        filament,
        decisions: effectiveSelectedDecisions,
        source3mf: imported3mf && orientationId === "current" ? { archive: imported3mf.archive, projectSettings: imported3mf.projectSettings } : undefined,
        settings: { layer: recommendation.layer, walls: recommendation.walls, topLayers: recommendation.base.top, bottomLayers: recommendation.base.bottom, infill: recommendation.infill, infillPattern: recommendation.pattern, outerWallSpeed: recommendation.base.outer, innerWallSpeed: recommendation.base.inner, infillSpeed: recommendation.base.infill, topSpeed: recommendation.base.topSpeed, acceleration: recommendation.base.acceleration, brim: recommendation.brim, ironing: recommendation.ironing, texture: recommendation.texture, support: recommendation.supportPlan },
      });
      const url = URL.createObjectURL(project.blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = project.filename; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setExportReceipt(project.verification.applied);
      setExportStatus(`3MF v7 vérifié avant téléchargement : ${project.appliedKeys.length} clés présentes et déclarées. ${imported3mf && orientationId === "current" ? "La structure, les plateaux et les réglages non cochés du 3MF original sont conservés." : "Un nouveau projet Creality Hi a été construit avec l’orientation choisie."}`);
    } catch (error) {
      setExportReceipt(null);
      setExportStatus(error instanceof Error ? error.message : "Le contrôle du 3MF a échoué ; aucun fichier n’a été téléchargé.");
    }
  }
  function chooseOrientation(id: string) {
    if (!sourceTriangles.length) return;
    setOrientationId(id); setMesh(analyseMesh(mesh?.name ?? "modèle", rotateTriangles(sourceTriangles, id)));
  }
  function toggleDecision(id: ExportDecision) {
    setSelectedDecisions(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }
  function exportConfiguration() {
    const text = JSON.stringify(exchangeConfiguration, null, 2);
    downloadBlob(new Blob([text], { type: "application/json" }), `${safeExchangeName(mesh?.name)}_PrintPilot_configuration_v1.json`);
    setExchangeStatus("Configuration JSON exportée. Elle ne contient ni facture, ni donnée de compte, ni photo.");
  }
  function exportCurrentStl() {
    if (!mesh) { setExchangeStatus("Importe d’abord un STL ou un 3MF."); return; }
    downloadBlob(binaryStl(mesh.name, mesh.triangles), `${safeExchangeName(mesh.name)}_orientation_${orientationId}.stl`);
    setExchangeStatus(imported3mf ? "STL fusionné exporté. Les objets, couleurs, plateaux et réglages du 3MF ne peuvent pas être conservés dans un STL." : "STL exporté avec l’orientation actuellement affichée.");
  }
  function exportOriginal3mf() {
    if (!imported3mf) return;
    const exact = imported3mf.archive.slice().buffer as ArrayBuffer;
    downloadBlob(new Blob([exact], { type: "model/3mf" }), `${safeExchangeName(mesh?.name)}_original.3mf`);
    setExchangeStatus("Copie intacte du 3MF importé exportée.");
  }
  async function copyAgentPrompt() {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(promptForAgent);
      else {
        const area = document.createElement("textarea"); area.value = promptForAgent; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
      }
      setExchangeStatus("Prompt copié. Ajoute le JSON, le STL ou 3MF et tes photos dans la conversation avec l’agent.");
    } catch { setExchangeStatus("Copie automatique impossible : sélectionne le prompt puis copie-le manuellement."); }
  }
  async function importConfiguration(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parsePrintPilotExchange(await file.text());
      const criteria = imported.criteria;
      const text = (key: string) => typeof criteria[key] === "string" ? String(criteria[key]) : null;
      const boolean = (key: string) => typeof criteria[key] === "boolean" ? Boolean(criteria[key]) : null;
      if (imported.machine.printer === "Creality Hi") setPrinter("hi");
      else setPrinter("k2");
      if (["0.4", "0.6"].includes(imported.machine.nozzleMm)) setNozzle(imported.machine.nozzleMm);
      const importedFilament = inventory.find(item => item.id === imported.filament.id || item.label === imported.filament.label);
      if (importedFilament) setFilamentId(importedFilament.id);
      if (text("useCase")) setUseCase(text("useCase")!);
      if (Array.isArray(criteria.secondaryUses)) setSecondaryUses(criteria.secondaryUses.map(String).slice(0, 2));
      if (text("priority")) setPriority(text("priority")!);
      if (text("precision")) setPrecision(text("precision")!);
      if (boolean("visibleTop") != null) setVisibleTop(boolean("visibleTop")!);
      if (text("loadDirection")) setLoadDirection(text("loadDirection")!);
      if (text("environment")) setEnvironment(text("environment")!);
      if (text("fitType")) setFitType(text("fitType")!);
      if (text("supportAccess")) setSupportAccess(text("supportAccess")!);
      if (text("exposure")) setExposure(text("exposure")!);
      if (text("shapeClass")) setShapeClass(text("shapeClass")!);
      if (text("undersideFinish")) setUndersideFinish(text("undersideFinish")!);
      if (text("featureSize")) setFeatureSize(text("featureSize")!);
      const importedTextureIntent = ["preserve", "none", "fine", "medium", "grip", "localized"].includes(text("textureIntent") ?? "") ? text("textureIntent")! : "preserve";
      setTextureIntent(importedTextureIntent);
      if (["balanced", "quality", "fast"].includes(text("mode") ?? "")) setMode(text("mode") as typeof mode);
      setAppliedPreset(text("appliedPreset") ?? "");
      const allowed: ExportDecision[] = ["layer", "walls", "shells", "infill", "support", "brim", "ironing", "texture"];
      const importedFit = text("fitType") ?? "none", importedFeature = text("featureSize") ?? "normal";
      const textureBlocked = ["fine", "medium", "grip"].includes(importedTextureIntent) && (importedFit !== "none" || importedFeature === "micro");
      setSelectedDecisions(imported.selectedDecisions.filter((item): item is ExportDecision => allowed.includes(item as ExportDecision) && !(item === "texture" && (textureBlocked || ["preserve", "localized"].includes(importedTextureIntent)))));
      const result = imported.printResult;
      if (["success", "mixed", "failed"].includes(String(result.outcome))) setOutcome(String(result.outcome) as typeof outcome);
      if (Number.isFinite(Number(result.qualityRating))) setQualityRating(Math.max(1, Math.min(5, Number(result.qualityRating))));
      setDefects(String(result.defects ?? "")); setPrintNotes(String(result.notes ?? "")); setSlicedHours(String(result.slicedHours ?? "")); setSlicedMinutes(String(result.slicedMinutes ?? "")); setSlicedGrams(String(result.slicedGrams ?? ""));
      if (result.electricityPricePerKwh != null) setElectricityPrice(String(result.electricityPricePerKwh));
      if (result.averagePowerW != null) setAveragePower(String(result.averagePowerW));
      const sameModel = Boolean(mesh && sourceFingerprint && imported.source.fingerprint === sourceFingerprint);
      if (sameModel && imported.source.orientationId) chooseOrientation(imported.source.orientationId);
      setStep(4);
      setExchangeStatus(`${file.name} importé. ${sameModel ? "Le modèle correspond : l’orientation a été restaurée." : mesh ? "Attention : le modèle chargé ne correspond pas à l’empreinte du JSON ; son orientation n’a pas été modifiée." : "Charge ensuite le STL ou 3MF associé pour vérifier sa géométrie et son orientation."}${importedFilament ? "" : " La bobine référencée n’existe pas dans cet inventaire."}`);
    } catch (error) { setExchangeStatus(error instanceof Error ? error.message : "Import JSON impossible."); }
    finally { event.target.value = ""; }
  }
  async function savePrint() {
    if (!user) { setPrintStatus("Connecte-toi pour enregistrer l’historique."); return; }
    const response = await fetch("/api/prints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: mesh?.name ?? "Projet PrintPilot", sourceFileName: mesh?.name, filamentId: filament.dbId ?? null, durationMinutes: Math.round(slicedCost.hours * 60) || null,
      filamentUsedG: slicedCost.grams || null, materialCost: slicedCost.materialCost, energyCost: slicedCost.energyCost, totalCost: slicedCost.totalCost,
      outcome, qualityRating, defects, notes: printNotes, settings: { recommendation, selectedDecisions: effectiveSelectedDecisions, orientationId, filament: filament.label },
    }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setPrintStatus(payload.error ?? "Enregistrement impossible."); return; }
    setPrintStatus("Impression ajoutée à la mémoire PrintPilot."); setDefects(""); setPrintNotes(""); await reloadPrints();
  }
  async function loadFile(file: File) {
    setError(""); setExportStatus(""); setOrientationId("current");
    if (![".stl", ".3mf"].some(extension => file.name.toLowerCase().endsWith(extension))) { setFileState("error"); setError("Format non reconnu. Utilise un fichier STL ou 3MF."); return; }
    try {
      setFileState("loading");
      const buffer = await file.arrayBuffer();
      setSourceFingerprint(await fileFingerprint(buffer));
      if (file.name.toLowerCase().endsWith(".3mf")) {
        const project = read3mfProject(buffer);
        const triangles = project.triangles as Triangle[];
        setImported3mf(project); setSourceTriangles(triangles); setMesh(analyseMesh(file.name, triangles));
        if (project.printerProfile?.toLowerCase().includes("creality hi")) setPrinter("hi");
        if (project.printerProfile?.includes("0.6")) setNozzle("0.6");
      } else {
        const triangles = parseSTL(buffer);
        setImported3mf(null); setSourceTriangles(triangles); setMesh(analyseMesh(file.name, triangles));
      }
      setFileState("idle"); setStep(2);
    } catch (e) { setFileState("error"); setError(e instanceof Error ? e.message : "Impossible d’analyser ce fichier."); }
  }
  const choose = (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) loadFile(file); }, drop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) loadFile(file); };
  return <main><TutorialPanel item={tutorial} onClose={() => setTutorial(null)} />
    {inventoryOpen && <InventoryPanel inventory={inventory} loading={inventoryLoading} onReload={reloadInventory} onClose={() => setInventoryOpen(false)} />}
    {historyOpen && <PrintHistoryPanel prints={prints} loading={historyLoading} onClose={() => setHistoryOpen(false)} />}
    {accountOpen && <AccountPanel user={user} inventoryCount={inventory.length} onClose={() => setAccountOpen(false)} />}
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">P</span><span>PRINTPILOT <b>HI</b></span></a><div className="machine-strip"><span className="status-dot"></span><label>Imprimante<select value={printer} onChange={e => setPrinter(e.target.value)}><option value="hi">Creality Hi</option><option value="k2">Creality K2 / autre</option></select></label><label>Buse<select value={nozzle} onChange={e => setNozzle(e.target.value)}><option value="0.4">0,4 mm</option><option value="0.6">0,6 mm</option></select></label><span className="machine-spec">260 × 260 × 300</span></div><div className="top-actions"><div className="experience-switch" aria-label="Niveau d’explication"><button className={experienceMode === "guided" ? "active" : ""} onClick={() => changeExperienceMode("guided")}>Guidé</button><button className={experienceMode === "expert" ? "active" : ""} onClick={() => changeExperienceMode("expert")}>Expert</button></div><button className="ghost" onClick={() => { setHistoryOpen(true); void reloadPrints(); }}>Historique <b>{prints.length}</b></button><button className="ghost" onClick={() => setInventoryOpen(true)}>Inventaire <b>{inventory.length}</b></button><button className="account-button" onClick={() => setAccountOpen(true)}><span>{(user?.displayName ?? "V").charAt(0).toUpperCase()}</span><i>{user?.displayName ?? "Compte"}</i></button></div></header>
    {authError && <div className="auth-warning"><b>Connexion Google impossible.</b> {authError === "invalid_oauth_response" ? "La réponse OAuth a expiré ou ne correspond pas à cette session. Recommence la connexion." : "Google n’a pas pu confirmer la connexion. Vérifie l’URI de redirection et les identifiants OAuth."}</div>}
    {printer !== "hi" && <div className="printer-warning"><b>Attention : mauvais profil machine.</b> Après l’ouverture d’un 3MF, Creality Print peut sélectionner une K2. Remets « Creality Hi » pour retrouver les bons profils.</div>}
    <section className="hero" id="top"><div className="hero-copy"><span className="eyebrow">ASSISTANT PERSONNEL · CREALITY HI</span><h1>Le bon profil.<br/><em>Les bons supports.</em><br/>Avant d’imprimer.</h1><p>Importe une pièce, combine géométrie, usage et bobine réelle, puis obtiens une configuration expliquée — avec le chemin exact dans Creality Print.</p></div><div className="hero-metric"><span>Moteur de décision basé sur</span><b>GÉOMÉTRIE</b><b>USAGE</b><b>INVENTAIRE</b></div></section>
    <nav className="steps">{["Modèle", "Usage", "Filament", "Configuration"].map((label, i) => <button key={label} className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""} onClick={() => setStep(i + 1)}><span>{step > i + 1 ? "✓" : String(i + 1).padStart(2, "0")}</span>{label}</button>)}</nav>
    <section className="workspace"><div className="stage">
      {step === 1 && <div className="step-panel"><Title step="01" title="Charge ton modèle" note="Analyse locale · le fichier ne quitte pas ton appareil"/><div className="upload-grid"><div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={drop} onClick={() => inputRef.current?.click()}><input ref={inputRef} type="file" accept=".stl,.3mf" onChange={choose} hidden/><span className="upload-icon">↥</span><h3>{fileState === "loading" ? "Analyse en cours…" : "Dépose un STL ou un 3MF"}</h3><p>STL : géométrie et orientation<br/>3MF : géométrie, plateaux et réglages existants</p><button className="primary">Choisir un fichier</button>{error && <div className="error-line">{error}</div>}</div><div className="analysis-preview"><ModelCanvas stats={mesh}/><div className="preview-key"><span><i className="green"></i>surface imprimable</span><span><i className="orange"></i>surplomb probable</span><span>La caméra ne change pas l’impression</span></div><p className="orientation-assumption">Orientation analysée : position réelle du fichier, point Z le plus bas posé sur le plateau pour un STL. Pour tourner réellement la pièce à l’export, sélectionne une orientation sous l’aperçu.</p></div></div>{imported3mf && <section className="import-summary"><div><span>PROJET 3MF LU</span><b>{imported3mf.objectCount} objet(s) · {imported3mf.plateCount} plateau(x)</b></div><dl><div><dt>Application</dt><dd>{imported3mf.sourceApplication ?? "Inconnue"}</dd></div><div><dt>Imprimante</dt><dd>{imported3mf.printerProfile ?? "Non définie"}</dd></div><div><dt>Processus</dt><dd>{imported3mf.processProfile ?? "Non défini"}</dd></div><div><dt>Filament(s)</dt><dd>{imported3mf.filamentProfiles.join(", ") || "Non défini"}</dd></div></dl><p>PrintPilot conservera le projet original et ne remplacera que les réglages que tu coches. Le fichier reste analysé localement.</p></section>}{orientationChoices.length > 0 && <section className="orientation-picker"><div><span>ORIENTATION DU MODÈLE</span><h3>Compare avant d’activer les supports</h3><p>Le score combine surplombs, hauteur et contact au plateau. La première proposition est la plus intéressante selon cette estimation géométrique.</p></div><div className="orientation-grid">{orientationChoices.map((choice, index) => <button key={choice.id} className={orientationId === choice.id ? "active" : ""} onClick={() => chooseOrientation(choice.id)}><span>{index === 0 ? "CONSEILLÉE" : "OPTION"}</span><b>{choice.label}</b><small>{fmt(choice.stats.overhangPercent, 1)}% surplomb · base {fmt(choice.stats.baseScore)}/100 · H {fmt(choice.stats.size[2], 1)} mm</small></button>)}</div></section>}{imported3mf && imported3mf.plateCount > 1 && <p className="orientation-lock">Projet multi-plateaux : orientation conservée pour ne pas casser sa structure. L’analyse des supports doit être vérifiée objet par objet dans Creality Print.</p>}<button className="text-action" onClick={() => setStep(2)}>Continuer sans modèle →</button></div>}
      {step === 2 && <div className="step-panel">
        <Title step="02" title="À quoi servira la pièce ?" note="L’usage change davantage les réglages que la forme seule"/>
        <section className="preset-picker"><div><span>DÉMARRAGES RAPIDES</span><p>Un preset préremplit le questionnaire. Tu peux ensuite modifier chaque réponse ; les supports restent calculés depuis le STL.</p></div><div className="preset-grid">{PROJECT_PRESETS.map(preset => <button key={preset.id} className={appliedPreset === preset.id ? "active" : ""} onClick={() => applyProjectPreset(preset)}><b>{preset.title}</b><small>{preset.subtitle}</small></button>)}</div></section>
        <div className="usage-heading"><b>Choisis un usage principal</b><span>Puis ajoute jusqu’à 2 usages secondaires · {secondaryUses.length}/2 sélectionné(s)</span></div>
        <div className="choice-grid">{USES.map(u => { const primary = useCase === u.id, secondary = secondaryUses.includes(u.id), limitReached = secondaryUses.length >= 2 && !secondary; return <div key={u.id} className={`choice-card usage-card ${primary ? "selected" : ""} ${secondary ? "secondary-selected" : ""}`}><button className="usage-primary" onClick={() => choosePrimaryUse(u.id)}><span className="choice-radio"></span><b>{u.title}</b><small>{u.subtitle}</small></button><label><input type="checkbox" checked={secondary} disabled={primary || limitReached} onChange={() => toggleSecondaryUse(u.id)}/><span>{primary ? "Usage principal" : "Ajouter en secondaire"}</span></label></div>; })}</div>
        <div className="form-grid"><fieldset><legend><InfoLabel item="priority">Priorité</InfoLabel></legend><div className="segmented">{[["quality","Finition"],["balance","Équilibre"],["speed","Rapidité"],["strength","Solidité"]].map(([id,label]) => <button key={id} className={priority === id ? "active" : ""} onClick={() => setPriority(id)}>{label}</button>)}</div></fieldset><fieldset><legend><InfoLabel item="precision">Précision souhaitée</InfoLabel></legend><div className="segmented three">{[["fine","Fine"],["standard","Standard"],["rough","Large"]].map(([id,label]) => <button key={id} className={precision === id ? "active" : ""} onClick={() => setPrecision(id)}>{label}</button>)}</div></fieldset><label className="switch-row"><span><b><InfoLabel item="visibleTop">Face supérieure visible</InfoLabel></b><small>Peut justifier le lissage</small></span><input type="checkbox" checked={visibleTop} onChange={e => setVisibleTop(e.target.checked)}/><i></i></label><label className="select-row"><span><b><InfoLabel item="loadDirection">Effort mécanique</InfoLabel></b><small>Direction et intensité attendues</small></span><select value={loadDirection} onChange={e => setLoadDirection(e.target.value)}><option value="faible">Faible / décoratif</option><option value="xy">Principalement dans le plan XY</option><option value="z">Risque entre couches Z</option><option value="multi">Multidirectionnel</option></select></label><label className="select-row texture-choice"><span><b><InfoLabel item="textureIntent">Texturage extérieur</InfoLabel></b><small>Jamais activé automatiquement</small></span><select value={textureIntent} onChange={e => chooseTextureIntent(e.target.value)}><option value="preserve">Ne pas modifier</option><option value="none">Désactiver explicitement</option><option value="fine">Texture fine décorative</option><option value="medium">Texture moyenne</option><option value="grip">Texture forte / grip</option><option value="localized">Peinture localisée manuelle</option></select></label></div>
        <details className="advanced-criteria" open={experienceMode === "expert"}><summary>Critères avancés {experienceMode === "guided" ? "· facultatif" : "· mode expert"}</summary><div className="criteria-grid">
          <label><InfoLabel item="shapeClass">Forme globale</InfoLabel><select value={shapeClass} onChange={e => setShapeClass(e.target.value)}><option value="prismatic">Mécanique / prismatique</option><option value="organic">Organique / figurine</option><option value="tall">Fine et haute</option><option value="broad">Large dessous plat</option><option value="cavity">Cavité ou tunnel interne</option></select></label>
          <label><InfoLabel item="featureSize">Plus petit détail</InfoLabel><select value={featureSize} onChange={e => setFeatureSize(e.target.value)}><option value="normal">Supérieur à 1,2 mm</option><option value="fine">Entre 0,6 et 1,2 mm</option><option value="micro">Inférieur à 0,6 mm</option></select></label>
          <label><InfoLabel item="environment">Environnement</InfoLabel><select value={environment} onChange={e => setEnvironment(e.target.value)}><option value="inside">Intérieur sec</option><option value="outside">Extérieur / balcon</option><option value="humid">Pièce humide</option></select></label>
          <label><InfoLabel item="exposure">Exposition</InfoLabel><select value={exposure} onChange={e => setExposure(e.target.value)}><option value="normal">Normale</option><option value="water">Eau / humidité durable</option><option value="heat">Chaleur / soleil</option><option value="uv">UV directs</option></select></label>
          <label><InfoLabel item="fitType">Ajustement</InfoLabel><select value={fitType} onChange={e => setFitType(e.target.value)}><option value="none">Aucun assemblage précis</option><option value="loose">Jeu libre</option><option value="sliding">Coulissant</option><option value="press">Serré / clipsé</option><option value="hole">Trou avec cote critique</option></select></label>
          <label><InfoLabel item="supportAccess">Accès aux supports</InfoLabel><select value={supportAccess} onChange={e => setSupportAccess(e.target.value)}><option value="easy">Facile après impression</option><option value="delicate">Face visible ou fragile</option><option value="closed">Cavité difficile d’accès</option></select></label>
          <label><InfoLabel item="undersideFinish">Qualité du dessous</InfoLabel><select value={undersideFinish} onChange={e => setUndersideFinish(e.target.value)}><option value="standard">Standard</option><option value="clean">La plus propre possible</option><option value="removal">Retrait très facile</option></select></label>
        </div></details>
        <Actions back={() => setStep(1)} next={() => setStep(3)} nextLabel="Choisir le filament"/>
      </div>}
      {step === 3 && <div className="step-panel"><div className="section-title"><div><span className="eyebrow">ÉTAPE 03</span><h2>Choisis la bobine</h2></div><button className="secondary" onClick={() => setInventoryOpen(true)}>Gérer l’inventaire</button></div><div className="filament-list">{inventory.map(f => <button key={f.id} className={`filament-row ${filamentId === f.id ? "selected" : ""}`} onClick={() => setFilamentId(f.id)}><span className={`spool ${f.family.toLowerCase().replace(" ", "-")}`} style={f.colorHex ? { borderColor: f.colorHex } : undefined}></span><span><b>{f.label}</b><small>{f.remainingG != null ? `${fmt(f.remainingG)} g restants · ` : "Quantité inconnue · "}{f.note}</small></span><em>{f.family}</em></button>)}</div><div className="rfid-note"><b>Bobine RFID verrouillée ?</b><span>Retire puis réinsère la bobine et déclare-la manuellement si Creality Print empêche l’édition.</span><button onClick={() => setTutorial("filament")}>Voir où régler</button></div><Actions back={() => setStep(2)} next={() => setStep(4)} nextLabel="Calculer la configuration"/></div>}
      {step === 4 && <div className="step-panel result-panel">
        <div className="section-title"><div><span className="eyebrow">ÉTAPE 04</span><h2>Configuration conseillée</h2></div><span className="confidence">CONFIANCE {mesh ? "ÉLEVÉE" : "MOYENNE"}</span></div>
        <div className="mode-tabs">{[["quality","Qualité"],["balanced","Recommandée"],["fast","Rapide"]].map(([id,label]) => <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id as typeof mode)}>{label}{id === "balanced" && <small>MEILLEUR COMPROMIS</small>}</button>)}</div>
        <div className="result-grid"><div className="recipe">
          <div className="recipe-head"><div><span>PROFIL OFFICIEL DE BASE</span><b>{recommendation.layer}</b></div><span className="pill">{filament.family}</span></div>
          <Setting icon="↕" label="Hauteur de couche" value={recommendation.layer} onHelp={() => setTutorial("layer")}/>
          <Setting icon="▥" label="Nombre de parois" value={`${recommendation.walls} lignes`} onHelp={() => setTutorial("walls")}/>
          <Setting icon="▤" label="Dessus / dessous" value={`${recommendation.base.top} / ${recommendation.base.bottom} couches`} onHelp={() => setTutorial("walls")}/>
          <Setting icon="◇" label="Densité de remplissage" value={`${recommendation.infill} % · ${recommendation.pattern}`} onHelp={() => setTutorial("infill")}/>
          <Setting icon="⌁" label="Supports" value={recommendation.support} onHelp={() => setTutorial("supports")}/>
          <Setting icon="▱" label="Type de bordure" value={recommendation.brim} onHelp={() => setTutorial("brim")}/>
          <Setting icon="≋" label="Type de lissage" value={recommendation.ironing} onHelp={() => setTutorial("ironing")}/>
          <Setting icon="∿" label="Texturage / peau floue" value={recommendation.texture.label} onHelp={() => setTutorial("texture")}/>
          <div className="official-speeds"><span>VALEURS DU PROFIL CREALITY HI</span><b>Paroi ext. {recommendation.base.outer} mm/s</b><b>Paroi int. {recommendation.base.inner} mm/s</b><b>Surface sup. {recommendation.base.topSpeed} mm/s</b><b>Accélération {recommendation.base.acceleration} mm/s²</b></div>
          <div className="filament-tech"><span>BOBINE SÉLECTIONNÉE</span><b>{filament.label}</b><div><em>Buse</em><strong>{filament.nozzleTempMin != null || filament.nozzleTempMax != null ? `${filament.nozzleTempMin ?? "?"}–${filament.nozzleTempMax ?? "?"} °C` : "À compléter"}</strong></div><div><em>Plateau</em><strong>{filament.bedTempMin != null || filament.bedTempMax != null ? `${filament.bedTempMin ?? "?"}–${filament.bedTempMax ?? "?"} °C` : "À compléter"}</strong></div><div><em>Débit max.</em><strong>{filament.maxVolumetricSpeed != null ? `${filament.maxVolumetricSpeed} mm³/s` : "À calibrer"}</strong></div><div><em>PA / débit</em><strong>{filament.pressureAdvance != null || filament.flowRatio != null ? `${filament.pressureAdvance ?? "?"} / ${filament.flowRatio ?? "?"}` : "À calibrer"}</strong></div></div>
        </div><div className="support-card">
          <div className="card-label"><span>ANALYSE DES SUPPORTS</span><b>{mesh ? "ORIENTATION STL" : "À CONFIRMER"}</b></div><div className="support-score"><span>{mesh ? fmt(mesh.overhangPercent, 1) : "—"}<small>%</small></span><p>surface descendante hors plateau<br/>sous le seuil de 30°</p></div><div className="meter"><i style={{width: `${Math.min(100, mesh?.overhangPercent ?? 0)}%`}}></i></div><div className="support-verdict"><span className={!recommendation.supportPlan.enabled ? "ok" : "warn"}>{!recommendation.supportPlan.enabled ? "SANS SUPPORT PROBABLE" : "PLAN DE SUPPORT PROPOSÉ"}</span><h3>{mesh?.orientation ?? "Importe un STL pour l’analyse"}</h3><p>{mesh?.orientationNote ?? "Sans STL, PrintPilot ne décide plus d’activer les supports uniquement à partir d’une catégorie de forme."}</p></div>
          <div className="support-plan"><span>RÉGLAGES À REPORTER</span><dl><div><dt>Activer</dt><dd>{recommendation.supportPlan.enabled ? "Oui" : "Non"}</dd></div><div><dt>Type / style</dt><dd>{recommendation.supportPlan.enabled ? `${recommendation.supportPlan.type} · ${recommendation.supportPlan.style}` : "—"}</dd></div><div><dt>Angle de seuil</dt><dd>{recommendation.supportPlan.enabled ? `${recommendation.supportPlan.threshold}°` : "—"}</dd></div><div><dt>Sur plateau uniquement</dt><dd>{recommendation.supportPlan.enabled ? (recommendation.supportPlan.onPlateOnly ? "Oui" : "Non") : "—"}</dd></div><div><dt>Régions critiques seules</dt><dd>{recommendation.supportPlan.enabled ? (recommendation.supportPlan.criticalOnly ? "Oui" : "Non") : "—"}</dd></div><div><dt>Distance Z supérieure</dt><dd>{recommendation.supportPlan.enabled ? `${fmt(recommendation.supportPlan.topZ, 2)} mm` : "—"}</dd></div><div><dt>Distance support/objet XY</dt><dd>{recommendation.supportPlan.enabled ? `${fmt(recommendation.supportPlan.xy, 2)} mm` : "—"}</dd></div><div><dt>Interface supérieure</dt><dd>{recommendation.supportPlan.enabled ? `${recommendation.supportPlan.interfaceLayers} couches · ${fmt(recommendation.supportPlan.interfaceSpacing, 2)} mm` : "—"}</dd></div></dl></div>
          <div className="support-facts"><div><span>Contact plateau</span><b>{mesh ? `${fmt(mesh.baseScore)} / 100` : "—"}</b></div><div><span>Îlots</span><b>À valider au tranchage</b></div><div><span>Portée des ponts</span><b>Non mesurable sûrement depuis un STL seul</b></div></div><button className="secondary full" onClick={() => setTutorial("supports")}>Où régler les supports ?</button>
        </div></div>
        <section className="comparison-card"><div className="scope-head"><div><span>AVANT / APRÈS</span><h3>Choisis exactement ce que l’export modifie</h3></div><b>{effectiveSelectedDecisions.length} / 8 appliqués</b></div><p>{imported3mf ? "Valeurs actuelles lues dans le 3MF. Décoche une ligne pour conserver sa valeur et sa configuration existantes." : "Le STL ne contient aucun réglage. Les lignes cochées surchargent le profil officiel Creality Hi ; les autres restent au profil officiel."}</p><div className="comparison-table"><div className="comparison-head"><span>Réglage</span><span>Actuel</span><span>Conseillé</span><span>Export</span></div>{comparisonRows.map(row => <label key={row.id} className={`${effectiveSelectedDecisions.includes(row.id) ? "applied" : "preserved"}${row.disabled ? " decision-disabled" : ""}`}><b>{row.label}</b><span>{row.current}</span><strong>{row.recommended}</strong><span className="decision-toggle"><input type="checkbox" checked={effectiveSelectedDecisions.includes(row.id)} disabled={row.disabled} onChange={() => toggleDecision(row.id)}/><i></i>{row.disabled ? "Manuel" : effectiveSelectedDecisions.includes(row.id) ? "Appliquer" : "Conserver"}</span></label>)}</div>{experienceMode === "guided" && imported3mf && <small>Le mode Guidé masque les lignes déjà équivalentes. Passe en Expert pour tout voir.</small>}</section>
        <section className="scope-card"><div className="scope-head"><div><span>PORTÉE DE L’EXPORT</span><h3>Ce que PrintPilot a décidé</h3></div><b>{effectiveSelectedDecisions.length} décisions</b></div><div className="scope-grid">{exportAudit.map(item => <div key={item.label}><span>{item.label}</span><b>{item.value}</b><small>{item.reason}</small></div>)}</div><details><summary>Réglages volontairement laissés intacts</summary><p><b>Tour de purge et CFS, purges, rétraction, ventilation, coutures, largeurs de ligne, plateau et ordre d’impression.</b> PrintPilot ne désactive donc pas une tour de purge simplement parce qu’elle semble inutile : ces paramètres restent ceux du 3MF importé ou du profil officiel. Les calibrations de la fiche bobine ne sont pas injectées automatiquement.</p></details></section>
        <section className="estimate-card"><div><span>APRÈS TRANCHAGE DANS CREALITY PRINT</span><h3>Calculer le coût à partir des vraies valeurs</h3><p>Recopie la durée et la masse affichées après « Trancher le plateau ». Le STL seul ne permet pas une estimation fiable.</p></div><div className="slice-input-grid"><label><span>Heures</span><input inputMode="decimal" min="0" type="number" value={slicedHours} onChange={e => setSlicedHours(e.target.value)} placeholder="2"/></label><label><span>Minutes</span><input inputMode="decimal" min="0" max="59" type="number" value={slicedMinutes} onChange={e => setSlicedMinutes(e.target.value)} placeholder="35"/></label><label><span>Filament utilisé</span><div><input inputMode="decimal" min="0" type="number" value={slicedGrams} onChange={e => setSlicedGrams(e.target.value)} placeholder="84"/><em>g</em></div></label><label><span>Électricité</span><div><input inputMode="decimal" min="0" step="0.01" type="number" value={electricityPrice} onChange={e => setElectricityPrice(e.target.value)}/><em>€/kWh</em></div></label><label><span>Puissance moyenne</span><div><input inputMode="decimal" min="0" type="number" value={averagePower} onChange={e => setAveragePower(e.target.value)}/><em>W</em></div></label></div><div className="estimate-grid"><div><small>Matière</small><b>{slicedCost.materialCost == null ? "Prix/kg manquant" : `${fmt(slicedCost.materialCost, 2)} €`}</b></div><div><small>Électricité estimée</small><b>{slicedCost.energyCost == null ? "Durée manquante" : `${fmt(slicedCost.energyCost, 2)} €`}</b></div><div><small>Total direct</small><b>{slicedCost.totalCost == null ? "Données manquantes" : `${fmt(slicedCost.totalCost, 2)} €`}</b></div></div><p className="estimate-note">Matière = grammes tranchés × {filament.pricePerKg != null ? `${fmt(filament.pricePerKg, 2)} €/kg` : "prix/kg à renseigner dans la bobine"}. Électricité = durée × puissance moyenne × tarif. Le total n’inclut ni amortissement, ni maintenance, ni temps humain.</p></section>
        <section className="print-memory-card"><div><span>APRÈS L’IMPRESSION</span><h3>Noter le résultat</h3><p>{successfulWithFilament > 1 ? `${successfulWithFilament} impressions réussies sont enregistrées avec cette bobine.` : "Ces informations servent à ton historique et au dossier exporté."} Elles ne modifient jamais automatiquement les conseils ou les réglages.</p></div><div className="outcome-row">{([['success','Réussie'],['mixed','À améliorer'],['failed','Échec']] as const).map(([id, label]) => <button key={id} className={outcome === id ? `active ${id}` : ""} onClick={() => setOutcome(id)}>{label}</button>)}</div><div className="rating-row"><span>Qualité</span>{[1,2,3,4,5].map(value => <button key={value} className={qualityRating >= value ? "active" : ""} onClick={() => setQualityRating(value)}>★</button>)}</div><div className="memory-fields"><label><span>Défauts observés</span><input value={defects} onChange={event => setDefects(event.target.value)} placeholder="Stringing, warping, support difficile…"/></label><label><span>Notes</span><input value={printNotes} onChange={event => setPrintNotes(event.target.value)} placeholder="Ce que tu voudrais montrer à l’agent"/></label></div><button className="secondary" onClick={() => void savePrint()}>Enregistrer dans l’historique</button>{printStatus && <p className="form-message">{printStatus}</p>}</section>
        <section className="agent-exchange-card"><div className="scope-head"><div><span>DOSSIER POUR UN AGENT</span><h3>Exporte seulement ce dont tu as besoin</h3></div><b>100 % local</b></div><p>PrintPilot ne stocke aucun dossier supplémentaire. Télécharge les fichiers séparément, puis joins toi-même le JSON, le modèle et tes photos à l’agent de ton choix.</p><input ref={configInputRef} type="file" accept=".json,application/json" hidden onChange={importConfiguration}/><div className="exchange-actions"><button className="secondary" onClick={exportConfiguration}>Exporter la configuration JSON</button><button className="secondary" onClick={() => configInputRef.current?.click()}>Importer une configuration JSON</button><button className="secondary" disabled={!mesh} onClick={exportCurrentStl}>{imported3mf ? "Exporter un STL fusionné" : "Exporter le STL orienté"}</button>{imported3mf && <button className="secondary" onClick={exportOriginal3mf}>Réexporter le 3MF original</button>}</div><label className="prompt-preview"><span>Prompt préparé automatiquement</span><textarea readOnly rows={12} value={promptForAgent} onFocus={event => event.currentTarget.select()}/></label><button className="primary" onClick={() => void copyAgentPrompt()}>Copier le prompt</button>{exchangeStatus && <p className="exchange-status">{exchangeStatus}</p>}<small>Pour un diagnostic utile, joins au minimum le JSON et le modèle. Ajoute des photos nettes du défaut, une vue générale et, si nécessaire, une capture de l’aperçu du G-code.</small></section>
        <section className="export-card"><div><span>PROJET 3MF V7 · CONTRÔLÉ</span><h3>{imported3mf ? "Exporter le projet existant avec les choix appliqués" : "Exporter le STL avec les réglages appliqués"}</h3><p>{imported3mf && orientationId === "current" ? "La géométrie, les objets, les plateaux et tous les réglages non cochés du 3MF original sont conservés." : "Un nouveau projet Creality Hi est créé avec l’orientation affichée et uniquement les catégories cochées ci-dessus."}</p></div><button className="primary" onClick={exportProject} disabled={!mesh || nozzle !== "0.4"}>Vérifier et exporter le 3MF</button>{exportStatus && <p className="export-status">{exportStatus}</p>}{exportReceipt && <div className="export-receipt"><div><b>REÇU DU FICHIER</b><span>{exportReceipt.length} clés vérifiées dans l’archive téléchargée</span></div><ul>{exportReceipt.map(item => <li key={item.key}><code>{item.key}</code><span>{item.actual ?? "absent"}</span><b>{item.actual === item.expected && item.declared ? "✓ ÉCRITE" : "× ERREUR"}</b></li>)}</ul></div>}<small>Export ciblé : Creality Hi, buse 0,4 mm. Le fichier est rouvert localement avant téléchargement : chaque valeur doit être présente et déclarée dans <code>different_settings_to_system</code>. Vérifie ensuite le profil machine et l’aperçu couche par couche.</small></section>
        {recommendation.cautions.length > 0 && <div className="cautions">{recommendation.cautions.map(c => <p key={c}><b>À surveiller</b>{c}</p>)}</div>}
        <div className="reasoning"><b>Pourquoi cette configuration ?</b><p>{useCase === "functional" ? "La pièce est fonctionnelle : les parois portent l’essentiel de la résistance, avec un remplissage raisonnable." : "Le réglage suit ton usage et ta priorité."} {loadDirection === "z" ? "Le risque de rupture entre couches est signalé : réoriente la pièce avant d’augmenter simplement le remplissage." : "L’orientation reste le premier levier avant les supports et le remplissage."}</p></div>
      </div>}
    </div><aside className="inspector"><div className="inspector-head"><span>ANALYSE EN DIRECT</span><i className={mesh ? "live" : ""}></i></div><ModelCanvas stats={mesh} compact/>{mesh ? <><h3>{mesh.name}</h3><p className="muted">{mesh.triangles.length.toLocaleString("fr-FR")} triangles analysés localement</p><div className="stat-grid"><div><span>Dimensions X</span><b>{fmt(mesh.size[0], 1)} mm</b></div><div><span>Dimensions Y</span><b>{fmt(mesh.size[1], 1)} mm</b></div><div><span>Hauteur Z</span><b>{fmt(mesh.size[2], 1)} mm</b></div><div><span>Volume fermé</span><b>{fmt(mesh.volumeCm3, 1)} cm³</b></div></div><div className={`fit-check ${mesh.size[0] <= 260 && mesh.size[1] <= 260 && mesh.size[2] <= 300 ? "ok" : "bad"}`}><b>{mesh.size[0] <= 260 && mesh.size[1] <= 260 && mesh.size[2] <= 300 ? "✓ Compatible Creality Hi" : "× Hors volume Creality Hi"}</b><span>Volume utile 260 × 260 × 300 mm</span></div></> : <div className="empty-analysis"><h3>Aucun modèle chargé</h3><p>La recommandation fonctionne déjà avec tes critères. L’import STL ajoute dimensions, orientation et risque de supports.</p><button className="secondary full" onClick={() => setStep(1)}>Importer un STL</button></div>}<div className="principle"><span>RÈGLE N° 1</span><p>Orienter la pièce avant d’augmenter le remplissage ou d’activer des supports partout.</p></div></aside></section>
    <footer><span>PRINTPILOT HI · BÊTA PERSONNELLE</span><p>Les recommandations restent à valider dans l’aperçu du G-code avant impression.</p><button onClick={() => setTutorial("supports")}>Ouvrir le tutoriel</button></footer>
  </main>;
}

function Title({ step, title, note }: { step: string; title: string; note: string }) { return <div className="section-title"><div><span className="eyebrow">ÉTAPE {step}</span><h2>{title}</h2></div><span className="section-note">{note}</span></div>; }
function Actions({ back, next, nextLabel }: { back: () => void; next: () => void; nextLabel: string }) { return <div className="panel-actions"><button className="ghost" onClick={back}>← Retour</button><button className="primary" onClick={next}>{nextLabel} →</button></div>; }
