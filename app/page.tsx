"use client";

import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

type Vec3 = [number, number, number];
type Triangle = { a: Vec3; b: Vec3; c: Vec3; normal: Vec3; area: number };
type MeshStats = {
  name: string;
  triangles: Triangle[];
  size: Vec3;
  volumeCm3: number;
  overhangPercent: number;
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

const USES = [
  { id: "decor", title: "Décoratif", subtitle: "Aspect et surfaces" },
  { id: "functional", title: "Fonctionnel", subtitle: "Efforts et durée" },
  { id: "fit", title: "Ajustement", subtitle: "Jeux et précision" },
  { id: "outdoor", title: "Extérieur", subtitle: "UV et humidité" },
  { id: "container", title: "Contenant", subtitle: "Étanchéité relative" },
  { id: "prototype", title: "Prototype", subtitle: "Rapide et économique" },
];

const SETTINGS_HELP = {
  layer: { title: "Hauteur de couche", path: "Processus › Qualité › Hauteur de couche", detail: "Choisis ici le profil 0,08 à 0,28 mm. La première couche peut rester à 0,20 mm.", group: "Qualité" },
  walls: { title: "Parois", path: "Processus › Résistance › Coques de paroi", detail: "Augmenter les parois renforce souvent mieux une pièce que pousser fortement le remplissage.", group: "Résistance" },
  infill: { title: "Remplissage", path: "Processus › Résistance › Remplissage", detail: "Le motif et la densité agissent sur la rigidité, le poids et la durée d’impression.", group: "Résistance" },
  supports: { title: "Supports", path: "Processus › Supports › Activer les supports", detail: "Commence par vérifier l’orientation. Active ensuite les supports uniquement pour les zones réellement non imprimables.", group: "Supports" },
  brim: { title: "Adhérence", path: "Processus › Autres › Jupe et bordure", detail: "Une bordure aide les pièces hautes, étroites ou ayant peu de surface au plateau.", group: "Autres" },
  ironing: { title: "Lissage", path: "Processus › Qualité › Lissage", detail: "Pour une face supérieure visible, utilise « Toutes les surfaces supérieures » avec les valeurs calibrées par ton nuancier.", group: "Qualité" },
  filament: { title: "Filament", path: "Panneau de préparation › Filament", detail: "Vérifie la matière, la température et le débit. Les bobines RFID peuvent devoir être déclarées manuellement.", group: "Filament" },
};
type HelpKey = keyof typeof SETTINGS_HELP;

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
  const all = triangles.flatMap(t => [t.a, t.b, t.c]);
  const mins: Vec3 = [Infinity, Infinity, Infinity], maxs: Vec3 = [-Infinity, -Infinity, -Infinity];
  all.forEach(v => v.forEach((n, i) => { mins[i] = Math.min(mins[i], n); maxs[i] = Math.max(maxs[i], n); }));
  const totalArea = triangles.reduce((s, t) => s + t.area, 0) || 1;
  const supportArea = triangles.reduce((s, t) => s + (t.normal[axis] * sign < -0.55 ? t.area : 0), 0);
  const bed = sign === 1 ? mins[axis] : maxs[axis];
  const tolerance = Math.max(0.08, (maxs[axis] - mins[axis]) * 0.002);
  const bedArea = triangles.reduce((s, t) => {
    const touches = [t.a[axis], t.b[axis], t.c[axis]].every(v => Math.abs(v - bed) <= tolerance);
    return s + (touches ? t.area * Math.abs(t.normal[axis]) : 0);
  }, 0);
  const other = ([0, 1, 2] as const).filter(i => i !== axis);
  const footprint = Math.max(1, (maxs[other[0]] - mins[other[0]]) * (maxs[other[1]] - mins[other[1]]));
  return { axis, sign, support: supportArea / totalArea * 100, base: Math.min(100, bedArea / footprint * 100), height: maxs[axis] - mins[axis] };
}

function analyseMesh(name: string, triangles: Triangle[]): MeshStats {
  if (!triangles.length) throw new Error("Le fichier ne contient aucun triangle exploitable.");
  const points = triangles.flatMap(t => [t.a, t.b, t.c]);
  const mins: Vec3 = [Infinity, Infinity, Infinity], maxs: Vec3 = [-Infinity, -Infinity, -Infinity];
  points.forEach(v => v.forEach((n, i) => { mins[i] = Math.min(mins[i], n); maxs[i] = Math.max(maxs[i], n); }));
  const size: Vec3 = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
  const signedVolume = triangles.reduce((s, t) => s + dot(t.a, cross(t.b, t.c)) / 6, 0);
  const candidates = ([0, 1, 2] as const).flatMap(axis => [geometryForAxis(triangles, axis, 1), geometryForAxis(triangles, axis, -1)]);
  candidates.sort((a, b) => (a.support + a.height / 100 - a.base * 0.12) - (b.support + b.height / 100 - b.base * 0.12));
  const current = geometryForAxis(triangles, 2, 1), best = candidates[0], labels = ["X", "Y", "Z"];
  const orientation = best.axis === 2 && best.sign === 1 ? "Orientation actuelle" : `${best.sign === -1 ? "Retourner puis " : ""}poser l’axe ${labels[best.axis]}`;
  const gain = Math.max(0, current.support - best.support);
  return { name, triangles, size, volumeCm3: Math.abs(signedVolume) / 1000, overhangPercent: current.support, baseScore: current.base, orientation, orientationNote: gain > 2 ? `Estimation : environ ${gain.toFixed(1)} points de surface à supporter en moins.` : "L’orientation importée est déjà proche du meilleur compromis détecté." };
}

function fmt(n: number, digits = 0) { return Number.isFinite(n) ? n.toFixed(digits).replace(".", ",") : "—"; }

function ModelCanvas({ stats }: { stats: MeshStats | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState<[number, number]>([-0.55, 0.75]);
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1, box = canvas.getBoundingClientRect();
    canvas.width = box.width * ratio; canvas.height = box.height * ratio; ctx.scale(ratio, ratio); ctx.clearRect(0, 0, box.width, box.height);
    const grid = 22; ctx.strokeStyle = "rgba(108,132,119,.16)"; ctx.lineWidth = 1;
    for (let x = -box.height; x < box.width + box.height; x += grid) { ctx.beginPath(); ctx.moveTo(x, box.height * .72); ctx.lineTo(x + box.height, box.height); ctx.stroke(); }
    for (let x = 0; x < box.width + box.height; x += grid) { ctx.beginPath(); ctx.moveTo(x, box.height * .72); ctx.lineTo(x - box.height, box.height); ctx.stroke(); }
    if (!stats) { ctx.fillStyle = "rgba(211,226,216,.38)"; ctx.font = "600 13px ui-monospace"; ctx.textAlign = "center"; ctx.fillText("APERÇU DU MODÈLE", box.width / 2, box.height / 2 - 5); ctx.font = "12px system-ui"; ctx.fillStyle = "rgba(211,226,216,.22)"; ctx.fillText("Importe un STL pour commencer", box.width / 2, box.height / 2 + 18); return; }
    const tris = stats.triangles.length > 10000 ? stats.triangles.filter((_, i) => i % Math.ceil(stats.triangles.length / 10000) === 0) : stats.triangles;
    const [cx, cy, cz] = stats.size.map(v => v / 2) as Vec3;
    const scale = Math.min(box.width * .64 / Math.max(stats.size[0], stats.size[1], 1), box.height * .60 / Math.max(stats.size[2], stats.size[1], 1));
    const project = (v: Vec3) => { let x = v[0] - cx, y = v[1] - cy, z = v[2] - cz; const ca = Math.cos(rotation[1]), sa = Math.sin(rotation[1]); [x, z] = [x * ca + z * sa, -x * sa + z * ca]; const cb = Math.cos(rotation[0]), sb = Math.sin(rotation[0]); [y, z] = [y * cb - z * sb, y * sb + z * cb]; return [box.width / 2 + x * scale, box.height * .48 - y * scale, z] as const; };
    tris.map(t => ({ t, z: (project(t.a)[2] + project(t.b)[2] + project(t.c)[2]) / 3 })).sort((a, b) => a.z - b.z).forEach(({ t }) => { const [a, b, c] = [project(t.a), project(t.b), project(t.c)]; const danger = t.normal[2] < -0.55; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fillStyle = danger ? "rgba(239,156,78,.30)" : "rgba(75,230,149,.30)"; ctx.fill(); ctx.strokeStyle = danger ? "rgba(239,156,78,.16)" : "rgba(129,240,180,.13)"; ctx.lineWidth = .55; ctx.stroke(); });
  }, [stats, rotation]);
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => { drag.current = { x: e.clientX, y: e.clientY, rx: rotation[0], ry: rotation[1] }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => { if (drag.current) setRotation([drag.current.rx + (e.clientY - drag.current.y) * .008, drag.current.ry + (e.clientX - drag.current.x) * .008]); };
  return <canvas ref={ref} className="model-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} aria-label="Aperçu rotatif du modèle 3D" />;
}

function TutorialPanel({ item, onClose }: { item: HelpKey | null; onClose: () => void }) {
  if (!item) return null; const help = SETTINGS_HELP[item];
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="tutorial-drawer" onMouseDown={e => e.stopPropagation()} aria-modal="true" role="dialog">
    <div className="drawer-head"><div><span className="eyebrow">TUTO CONTEXTUEL</span><h2>{help.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer">×</button></div>
    <div className="breadcrumb">{help.path}</div><p>{help.detail}</p>
    <div className="mock-window"><div className="mock-top"><span></span><span></span><span></span><b>Creality Print</b></div><div className="mock-body"><div className="mock-nav"><strong>Processus</strong><i>Qualité</i><i>Résistance</i><i className={item === "supports" ? "active" : ""}>Supports</i><i>Vitesse</i><i>Autres</i></div><div className="mock-settings"><small>{help.group}</small><h4>{help.title}</h4><div className="mock-row"><span>Réglage sélectionné</span><b className="mock-field">À modifier ici</b></div><div className="mock-row faded"><span>Paramètre voisin</span><b className="mock-field">Auto</b></div><div className="focus-arrow">← REPÈRE</div></div></div></div>
    <div className="tip"><b>Contrôle final</b><span>Après le tranchage, ouvre l’aperçu couche par couche. Vérifie les îlots, les ponts et le départ des surplombs.</span></div><button className="primary full" onClick={onClose}>J’ai trouvé le réglage</button>
  </aside></div>;
}

function Setting({ icon, label, value, onHelp }: { icon: string; label: string; value: string; onHelp: () => void }) { return <div className="setting"><span className="setting-icon">{icon}</span><span><small>{label}</small><b>{value}</b></span><button onClick={onHelp}>Où régler ?</button></div>; }

export default function Home() {
  const [mesh, setMesh] = useState<MeshStats | null>(null), [fileState, setFileState] = useState<"idle" | "loading" | "error" | "manual">("idle"), [error, setError] = useState(""), [step, setStep] = useState(1);
  const [useCase, setUseCase] = useState("functional"), [priority, setPriority] = useState("balance"), [precision, setPrecision] = useState("standard"), [visibleTop, setVisibleTop] = useState(true), [loadDirection, setLoadDirection] = useState("faible");
  const [filamentId, setFilamentId] = useState(FILAMENTS[0].id), [printer, setPrinter] = useState("hi"), [mode, setMode] = useState<"balanced" | "quality" | "fast">("balanced"), [tutorial, setTutorial] = useState<HelpKey | null>(null);
  const inputRef = useRef<HTMLInputElement>(null), filament = FILAMENTS.find(f => f.id === filamentId)!;
  const recommendation = useMemo(() => {
    const quality = mode === "quality" || priority === "quality" || precision === "fine", fast = mode === "fast" || priority === "speed" || useCase === "prototype";
    let layer = quality ? "0,12 mm" : fast ? "0,24 mm" : "0,20 mm"; if (precision === "fine" && mode === "quality") layer = "0,08 mm"; if (precision === "rough" && mode === "fast") layer = "0,28 mm";
    let walls = useCase === "functional" || priority === "strength" || useCase === "container" ? 4 : 3; if (mode === "fast") walls = Math.max(2, walls - 1);
    const infill = priority === "strength" || useCase === "functional" ? 25 : useCase === "container" ? 18 : fast ? 10 : 15, pattern = priority === "strength" ? "Gyroïde" : "Cubique adaptatif", supportRatio = mesh?.overhangPercent ?? 0;
    const support = supportRatio < 2 ? "Désactivés" : supportRatio < 11 ? "Arborescents · plateau uniquement" : "Arborescents · zones critiques";
    const brim = mesh && (mesh.baseScore < 7 || Math.max(...mesh.size) / Math.max(1, Math.min(...mesh.size.filter(v => v > 0))) > 5) ? "Bordure 5 mm" : "Auto / aucune";
    const ironing = visibleTop && (useCase === "decor" || priority === "quality") ? "Toutes les surfaces supérieures" : "Désactivé", cautions: string[] = [];
    if (filament.family === "PETG") cautions.push("Le PETG file davantage et tolère moins bien les ponts : ralentir les ponts et sécher la bobine.");
    if (filament.family === "PLA Wood") cautions.push("Buse 0,6 mm conseillée ; éviter les très petites couches et surveiller le débit.");
    if (printer !== "hi") cautions.push("L’imprimante active n’est pas la Creality Hi : les profils et limites peuvent être incorrects.");
    if (mesh && mesh.overhangPercent > 10) cautions.push("Beaucoup de faces descendantes détectées : tester l’orientation proposée avant d’ajouter des supports.");
    return { layer, walls, infill, pattern, support, brim, ironing, cautions };
  }, [mode, priority, precision, useCase, mesh, visibleTop, filament, printer]);
  async function loadFile(file: File) { setError(""); if (file.name.toLowerCase().endsWith(".3mf")) { setFileState("manual"); setMesh(null); setStep(2); return; } if (!file.name.toLowerCase().endsWith(".stl")) { setFileState("error"); setError("Format non reconnu. Utilise un fichier STL ou 3MF."); return; } try { setFileState("loading"); setMesh(analyseMesh(file.name, parseSTL(await file.arrayBuffer()))); setFileState("idle"); setStep(2); } catch (e) { setFileState("error"); setError(e instanceof Error ? e.message : "Impossible d’analyser ce fichier."); } }
  const choose = (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) loadFile(file); }, drop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) loadFile(file); };
  return <main><TutorialPanel item={tutorial} onClose={() => setTutorial(null)} />
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">P</span><span>PRINTPILOT <b>HI</b></span></a><div className="machine-strip"><span className="status-dot"></span><label>Imprimante<select value={printer} onChange={e => setPrinter(e.target.value)}><option value="hi">Creality Hi</option><option value="k2">Creality K2 / autre</option></select></label><span className="machine-spec">BUSE 0,4 MM</span><span className="machine-spec">260 × 260 × 300</span></div><button className="ghost" onClick={() => setTutorial("layer")}>Guide Creality Print</button></header>
    {printer !== "hi" && <div className="printer-warning"><b>Attention : mauvais profil machine.</b> Après l’ouverture d’un 3MF, Creality Print peut sélectionner une K2. Remets « Creality Hi » pour retrouver les bons profils.</div>}
    <section className="hero" id="top"><div className="hero-copy"><span className="eyebrow">ASSISTANT DE PRÉPARATION · CREALITY HI</span><h1>Le bon profil.<br/><em>Les bons supports.</em><br/>Avant d’imprimer.</h1><p>Importe une pièce, indique son usage et obtiens une configuration expliquée — avec le chemin exact de chaque réglage dans Creality Print.</p></div><div className="hero-metric"><span>Décisions prises à partir de</span><b>GÉOMÉTRIE</b><b>USAGE</b><b>MATIÈRE</b></div></section>
    <nav className="steps">{["Modèle", "Usage", "Filament", "Configuration"].map((label, i) => <button key={label} className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""} onClick={() => setStep(i + 1)}><span>{step > i + 1 ? "✓" : String(i + 1).padStart(2, "0")}</span>{label}</button>)}</nav>
    <section className="workspace"><div className="stage">
      {step === 1 && <div className="step-panel"><Title step="01" title="Charge ton modèle" note="Analyse locale · le fichier ne quitte pas ton appareil"/><div className="upload-grid"><div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={drop} onClick={() => inputRef.current?.click()}><input ref={inputRef} type="file" accept=".stl,.3mf" onChange={choose} hidden/><span className="upload-icon">↥</span><h3>{fileState === "loading" ? "Analyse en cours…" : "Dépose un STL ou un 3MF"}</h3><p>STL : analyse automatique complète<br/>3MF : questionnaire guidé dans cette version</p><button className="primary">Choisir un fichier</button>{error && <div className="error-line">{error}</div>}</div><div className="analysis-preview"><ModelCanvas stats={mesh}/><div className="preview-key"><span><i className="green"></i>surface imprimable</span><span><i className="orange"></i>surplomb probable</span><span>Glisser pour tourner</span></div></div></div><button className="text-action" onClick={() => setStep(2)}>Continuer sans modèle →</button></div>}
      {step === 2 && <div className="step-panel"><Title step="02" title="À quoi servira la pièce ?" note="L’usage change davantage les réglages que la forme seule"/><div className="choice-grid">{USES.map(u => <button key={u.id} className={`choice-card ${useCase === u.id ? "selected" : ""}`} onClick={() => setUseCase(u.id)}><span className="choice-radio"></span><b>{u.title}</b><small>{u.subtitle}</small></button>)}</div><div className="form-grid"><fieldset><legend>Priorité</legend><div className="segmented">{[["quality","Finition"],["balance","Équilibre"],["speed","Rapidité"],["strength","Solidité"]].map(([id,label]) => <button key={id} className={priority === id ? "active" : ""} onClick={() => setPriority(id)}>{label}</button>)}</div></fieldset><fieldset><legend>Précision souhaitée</legend><div className="segmented three">{[["fine","Fine"],["standard","Standard"],["rough","Large"]].map(([id,label]) => <button key={id} className={precision === id ? "active" : ""} onClick={() => setPrecision(id)}>{label}</button>)}</div></fieldset><label className="switch-row"><span><b>Face supérieure visible</b><small>Peut justifier le lissage</small></span><input type="checkbox" checked={visibleTop} onChange={e => setVisibleTop(e.target.checked)}/><i></i></label><label className="select-row"><span><b>Effort mécanique</b><small>Direction et intensité attendues</small></span><select value={loadDirection} onChange={e => setLoadDirection(e.target.value)}><option value="faible">Faible / décoratif</option><option value="xy">Principalement dans le plan XY</option><option value="z">Risque entre couches Z</option><option value="multi">Multidirectionnel</option></select></label></div><Actions back={() => setStep(1)} next={() => setStep(3)} nextLabel="Choisir le filament"/></div>}
      {step === 3 && <div className="step-panel"><Title step="03" title="Choisis la bobine" note="Inventaire personnalisé · 10 références"/><div className="filament-list">{FILAMENTS.map(f => <button key={f.id} className={`filament-row ${filamentId === f.id ? "selected" : ""}`} onClick={() => setFilamentId(f.id)}><span className={`spool ${f.family.toLowerCase().replace(" ", "-")}`}></span><span><b>{f.label}</b><small>{f.note}</small></span><em>{f.family}</em></button>)}</div><div className="rfid-note"><b>Bobine RFID verrouillée ?</b><span>Retire puis réinsère la bobine et déclare-la manuellement si Creality Print empêche l’édition.</span><button onClick={() => setTutorial("filament")}>Voir où régler</button></div><Actions back={() => setStep(2)} next={() => setStep(4)} nextLabel="Calculer la configuration"/></div>}
      {step === 4 && <div className="step-panel result-panel"><div className="section-title"><div><span className="eyebrow">ÉTAPE 04</span><h2>Configuration conseillée</h2></div><span className="confidence">CONFIANCE {mesh ? "ÉLEVÉE" : "MOYENNE"}</span></div><div className="mode-tabs">{[["quality","Qualité"],["balanced","Recommandée"],["fast","Rapide"]].map(([id,label]) => <button key={id} className={mode === id ? "active" : ""} onClick={() => setMode(id as typeof mode)}>{label}{id === "balanced" && <small>MEILLEUR COMPROMIS</small>}</button>)}</div><div className="result-grid"><div className="recipe"><div className="recipe-head"><div><span>PROFIL DE BASE</span><b>{recommendation.layer}</b></div><span className="pill">{filament.family}</span></div><Setting icon="↕" label="Hauteur de couche" value={recommendation.layer} onHelp={() => setTutorial("layer")}/><Setting icon="▥" label="Parois" value={`${recommendation.walls} lignes`} onHelp={() => setTutorial("walls")}/><Setting icon="◇" label="Remplissage" value={`${recommendation.infill} % · ${recommendation.pattern}`} onHelp={() => setTutorial("infill")}/><Setting icon="⌁" label="Supports" value={recommendation.support} onHelp={() => setTutorial("supports")}/><Setting icon="▱" label="Adhérence" value={recommendation.brim} onHelp={() => setTutorial("brim")}/><Setting icon="≋" label="Lissage" value={recommendation.ironing} onHelp={() => setTutorial("ironing")}/></div><div className="support-card"><div className="card-label"><span>ANALYSE DES SUPPORTS</span><b>{mesh ? "MESURÉE" : "ESTIMÉE"}</b></div><div className="support-score"><span>{mesh ? fmt(mesh.overhangPercent, 1) : "—"}<small>%</small></span><p>surface descendante<br/>potentiellement critique</p></div><div className="meter"><i style={{width: `${Math.min(100, mesh?.overhangPercent ?? 0)}%`}}></i></div><div className="support-verdict"><span className={(mesh?.overhangPercent ?? 0) < 2 ? "ok" : "warn"}>{(mesh?.overhangPercent ?? 0) < 2 ? "SANS SUPPORT PROBABLE" : "ORIENTATION À VÉRIFIER"}</span><h3>{mesh?.orientation ?? "Importe un STL pour l’analyse"}</h3><p>{mesh?.orientationNote ?? "Sans géométrie, le conseil reste prudent et doit être validé dans l’aperçu couche par couche."}</p></div><div className="support-facts"><div><span>Contact plateau</span><b>{mesh ? `${fmt(mesh.baseScore)} / 100` : "—"}</b></div><div><span>Îlots</span><b>À valider au tranchage</b></div><div><span>Portée des ponts</span><b>À valider au tranchage</b></div></div><button className="secondary full" onClick={() => setTutorial("supports")}>Où régler les supports ?</button></div></div>{recommendation.cautions.length > 0 && <div className="cautions">{recommendation.cautions.map(c => <p key={c}><b>À surveiller</b>{c}</p>)}</div>}<div className="reasoning"><b>Pourquoi cette configuration ?</b><p>{useCase === "functional" ? "La pièce est fonctionnelle : quatre parois portent l’essentiel de la résistance, avec un remplissage raisonnable." : "Le réglage suit ton usage et ta priorité."} {loadDirection === "z" ? "Le risque de rupture entre couches est signalé : réoriente la pièce avant d’augmenter simplement le remplissage." : "L’orientation reste le premier levier avant les supports et le remplissage."}</p></div></div>}
    </div><aside className="inspector"><div className="inspector-head"><span>ANALYSE EN DIRECT</span><i className={mesh ? "live" : ""}></i></div><ModelCanvas stats={mesh}/>{mesh ? <><h3>{mesh.name}</h3><p className="muted">{mesh.triangles.length.toLocaleString("fr-FR")} triangles analysés localement</p><div className="stat-grid"><div><span>Dimensions X</span><b>{fmt(mesh.size[0], 1)} mm</b></div><div><span>Dimensions Y</span><b>{fmt(mesh.size[1], 1)} mm</b></div><div><span>Hauteur Z</span><b>{fmt(mesh.size[2], 1)} mm</b></div><div><span>Volume fermé</span><b>{fmt(mesh.volumeCm3, 1)} cm³</b></div></div><div className={`fit-check ${mesh.size[0] <= 260 && mesh.size[1] <= 260 && mesh.size[2] <= 300 ? "ok" : "bad"}`}><b>{mesh.size[0] <= 260 && mesh.size[1] <= 260 && mesh.size[2] <= 300 ? "✓ Compatible Creality Hi" : "× Hors volume Creality Hi"}</b><span>Volume utile 260 × 260 × 300 mm</span></div></> : <div className="empty-analysis"><h3>Aucun modèle chargé</h3><p>La recommandation fonctionne déjà avec tes critères. L’import STL ajoute dimensions, orientation et risque de supports.</p><button className="secondary full" onClick={() => setStep(1)}>Importer un STL</button></div>}<div className="principle"><span>RÈGLE N° 1</span><p>Orienter la pièce avant d’augmenter le remplissage ou d’activer des supports partout.</p></div></aside></section>
    <footer><span>PRINTPILOT HI · VERSION PILOTE</span><p>Les recommandations restent à valider dans l’aperçu du G-code avant impression.</p><button onClick={() => setTutorial("supports")}>Ouvrir le tutoriel</button></footer>
  </main>;
}

function Title({ step, title, note }: { step: string; title: string; note: string }) { return <div className="section-title"><div><span className="eyebrow">ÉTAPE {step}</span><h2>{title}</h2></div><span className="section-note">{note}</span></div>; }
function Actions({ back, next, nextLabel }: { back: () => void; next: () => void; nextLabel: string }) { return <div className="panel-actions"><button className="ghost" onClick={back}>← Retour</button><button className="primary" onClick={next}>{nextLabel} →</button></div>; }
