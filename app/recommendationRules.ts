export type GeometrySignals = {
  size: [number, number, number];
  overhangPercent: number;
  overhangAreaMm2: number;
  baseScore: number;
  bedContactAreaMm2: number;
};

export type BrimPlan = {
  action: "preserve" | "none" | "outer";
  label: string;
  reason: string;
  widthMm: number | null;
};

export type SupportPlanDecision = {
  action: "preserve" | "disable" | "enable" | "manual";
  enabled: boolean;
  type: "Arborescents (auto)" | "Normaux (auto)";
  style: "Arborescents Organiques" | "Ajusté" | "Défaut";
  reason: string;
};

function normalizedMaterial(value: string) {
  return value.trim().toUpperCase();
}

function isWarpProne(material: string) {
  const value = normalizedMaterial(material);
  return ["ABS", "ASA", "PA", "NYLON", "PC", "HIPS"].some(name => value === name || value.startsWith(`${name} `));
}

export function assessBrim(input: {
  geometry: GeometrySignals | null;
  material: string;
  shapeClass: string;
  speedPrint: boolean;
  objectCount?: number;
}): BrimPlan {
  const { geometry, material, shapeClass, speedPrint, objectCount = 1 } = input;
  if (!geometry) return {
    action: "preserve",
    label: "Conserver le profil",
    reason: "Sans géométrie et orientation fiables, PrintPilot ne force aucune bordure.",
    widthMm: null,
  };
  if (objectCount > 1) return {
    action: "preserve",
    label: "Vérifier par objet",
    reason: "Un projet multi-objet doit être évalué objet par objet ; une mesure fusionnée peut masquer une petite base.",
    widthMm: null,
  };

  const height = Math.max(0, geometry.size[2]);
  const contactArea = Math.max(0, geometry.bedContactAreaMm2);
  const contactSpan = Math.sqrt(Math.max(1, contactArea));
  const slenderness = height / contactSpan;
  const weakContact = contactArea < 100 || geometry.baseScore < 6;
  const tallAndNarrow = height > 35 && (slenderness > 3 || (shapeClass === "tall" && slenderness > 2));
  const highRisk = tallAndNarrow || (height > 80 && geometry.baseScore < 25) || (weakContact && height > 25);

  if (highRisk) return {
    action: "outer",
    label: "Bordure extérieure 5 mm",
    reason: `Contact ${Math.round(contactArea)} mm² et élancement ${slenderness.toFixed(1)} : le risque de décollement ou de bascule est significatif.`,
    widthMm: 5,
  };

  const uncertainAtSpeed = speedPrint && (slenderness > 1.6 || geometry.baseScore < 18);
  if (isWarpProne(material) || uncertainAtSpeed) return {
    action: "preserve",
    label: "Auto du profil",
    reason: isWarpProne(material)
      ? "Le matériau est sensible au gauchissement ; le mode Auto du slicer tient compte du matériau et de la vitesse."
      : "En Speed Print, le risque d’adhérence augmente sur cette base intermédiaire ; le mode Auto reste plus prudent.",
    widthMm: null,
  };

  const stable = contactArea >= 120 && geometry.baseScore >= 12 && slenderness < 2.2;
  if (stable) return {
    action: "none",
    label: "Aucune bordure",
    reason: `La base mesurée est stable (${Math.round(contactArea)} mm², élancement ${slenderness.toFixed(1)}) ; une bordure ajouterait surtout du retrait et des marques.`,
    widthMm: 0,
  };

  return {
    action: "preserve",
    label: "Auto du profil",
    reason: "Le risque est intermédiaire : conserver l’évaluation Auto de Creality Print est plus sûr qu’imposer une bordure fixe.",
    widthMm: null,
  };
}

export function assessSupport(input: {
  geometry: GeometrySignals | null;
  shapeClass: string;
  supportAccess: string;
  objectCount?: number;
}): SupportPlanDecision {
  const { geometry, shapeClass, supportAccess, objectCount = 1 } = input;
  const tree = shapeClass === "organic" || shapeClass === "tall";
  const type = tree ? "Arborescents (auto)" : "Normaux (auto)";
  const style = tree ? "Arborescents Organiques" : shapeClass === "broad" ? "Ajusté" : "Défaut";
  if (!geometry) return { action: "preserve", enabled: false, type, style, reason: "Sans STL orienté, les supports existants sont conservés et aucune activation n’est imposée." };
  if (objectCount > 1) return { action: "manual", enabled: false, type, style, reason: "Le projet contient plusieurs objets : contrôle et peinture des supports objet par objet dans l’aperçu." };

  const meaningfulOverhang = (geometry.overhangAreaMm2 >= 100 && geometry.overhangPercent >= 1.5) || geometry.overhangAreaMm2 >= 400;
  if (!meaningfulOverhang) return {
    action: "disable",
    enabled: false,
    type,
    style,
    reason: `Seulement ${geometry.overhangAreaMm2.toFixed(0)} mm² de faces descendantes critiques : le profil sans support est le point de départ le plus propre.`,
  };
  if (supportAccess === "closed") return {
    action: "manual",
    enabled: false,
    type,
    style,
    reason: "Des faces critiques existent dans une zone difficile d’accès : réorientation, découpe ou supports peints avant toute activation automatique.",
  };
  return {
    action: "enable",
    enabled: true,
    type,
    style,
    reason: `${geometry.overhangAreaMm2.toFixed(0)} mm² de faces descendantes critiques ont été détectés dans l’orientation actuelle.`,
  };
}

export function selectLayerProfile(input: {
  objective: string;
  precision: string;
  featureSize: string;
  nozzle: string;
  filamentCalibrated: boolean;
  maxVolumetricSpeed: number | null | undefined;
}) {
  const speedPrint = input.objective === "speed";
  const quality = input.objective === "quality" || input.precision === "fine";
  let layer = quality ? "0,12 mm" : speedPrint ? "0,24 mm" : "0,20 mm";

  if (input.featureSize === "micro" && input.nozzle === "0.4" && !speedPrint) layer = "0,08 mm";
  if (speedPrint && input.precision === "rough" && input.featureSize === "normal" && input.filamentCalibrated && input.maxVolumetricSpeed != null) layer = "0,28 mm";
  if (input.nozzle === "0.6" && (layer === "0,08 mm" || layer === "0,12 mm")) layer = quality ? "0,16 mm" : "0,20 mm";

  const speedGuard = !speedPrint
    ? null
    : input.filamentCalibrated && input.maxVolumetricSpeed != null
      ? `Débit volumique renseigné (${input.maxVolumetricSpeed} mm³/s) : Creality Print doit rester plafonné par cette valeur.`
      : "Débit volumique non calibré : profil 0,24 mm conservateur, sans hausse forcée des vitesses ni accélérations.";
  return { layer, speedPrint, speedGuard };
}
