import { completeCrealityHiProcessProfile, normalizeCrealityHiLayer } from "./crealityHiProcessProfiles";
import { unzipSync, zipSync } from "fflate";

type Vec3 = [number, number, number];

export type ExportTriangle = {
  a: Vec3;
  b: Vec3;
  c: Vec3;
};

export type ExportFilament = {
  label: string;
  family: string;
  brand?: string;
  colorHex?: string | null;
  nozzleTempMin?: number | null;
  nozzleTempMax?: number | null;
  bedTempMin?: number | null;
  bedTempMax?: number | null;
  maxVolumetricSpeed?: number | null;
  flowRatio?: number | null;
  pressureAdvance?: number | null;
  calibrated?: boolean;
};

export type CrealityProjectSettings = {
  layer: string;
  walls: number;
  topLayers: number;
  bottomLayers: number;
  infill: number;
  infillPattern: string;
  outerWallSpeed: number;
  innerWallSpeed: number;
  infillSpeed: number;
  topSpeed: number;
  acceleration: number;
  brim: string;
  ironing: string;
  texture: {
    action: "preserve" | "disable" | "global" | "localized";
    label: string;
    fuzzySkin: "none" | "external";
    thickness: number | null;
    pointDistance: number | null;
    firstLayer: boolean;
  };
  support: {
    enabled: boolean;
    type: string;
    style: string;
    threshold: number;
    onPlateOnly: boolean;
    criticalOnly: boolean;
    topZ: number;
    xy: number;
    interfaceLayers: number;
    interfaceSpacing: number;
  };
};

const encoder = new TextEncoder();

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function safeName(value: string) {
  return value.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9À-ÿ_-]+/g, "_").replace(/^_+|_+$/g, "") || "modele";
}

function layerNumber(layer: string) {
  return Number(layer.match(/[\d,.]+/)?.[0].replace(",", ".") ?? "0.2");
}

function presetLayer(layer: string) {
  return layerNumber(layer).toFixed(2);
}

function filamentPreset(family: string, nozzle: string) {
  const material = family.toUpperCase().includes("PETG") ? "PETG" : "PLA";
  return `Generic ${material} @Creality Hi ${nozzle} nozzle`;
}

function processPreset(layer: string, nozzle: string) {
  if (nozzle === "0.6") return "0.30mm Standard @Creality Hi 0.6 nozzle";
  return `${presetLayer(layer)}mm Standard @Creality Hi 0.4 nozzle`;
}

function supportType(value: string) {
  return value.startsWith("Arborescents") ? "tree(auto)" : "normal(auto)";
}

function supportStyle(value: string) {
  if (value.includes("Organiques")) return "organic";
  if (value === "Ajusté") return "snug";
  return "default";
}

function infillPattern(value: string) {
  return value === "Gyroïde" ? "gyroid" : "adaptivecubic";
}

export type ExportDecision = "layer" | "walls" | "shells" | "infill" | "support" | "brim" | "ironing" | "texture";
export type Existing3mfSource = { archive: Uint8Array; projectSettings: Record<string, unknown> };

export type ProjectVerification = {
  passed: boolean;
  applied: Array<{ key: string; expected: string; actual: string | null; declared: boolean }>;
  errors: string[];
};

/**
 * Only settings for which PrintPilot has made an explicit recommendation.
 * Everything else is inherited from the official Creality Hi process preset.
 */
function conservativeProcessOverrides(settings: CrealityProjectSettings, nozzle: string, enabled?: ExportDecision[]): Record<string, string> {
  const decisions = new Set<ExportDecision>(enabled ?? ["layer", "walls", "shells", "infill", "support", "brim", "ironing"]);
  const layer = nozzle === "0.6" ? 0.3 : layerNumber(settings.layer);
  const ironingEnabled = settings.ironing.startsWith("Toutes") || settings.ironing.startsWith("Surface");
  const overrides: Record<string, string> = {};

  if (decisions.has("layer")) overrides.layer_height = String(layer);
  if (decisions.has("walls")) overrides.wall_loops = String(settings.walls);
  if (decisions.has("shells")) Object.assign(overrides, { top_shell_layers: String(settings.topLayers), bottom_shell_layers: String(settings.bottomLayers) });
  if (decisions.has("infill")) Object.assign(overrides, { sparse_infill_density: `${settings.infill}%`, sparse_infill_pattern: infillPattern(settings.infillPattern) });
  if (decisions.has("support")) overrides.enable_support = settings.support.enabled ? "1" : "0";

  if (decisions.has("support") && settings.support.enabled) {
    Object.assign(overrides, {
      support_type: supportType(settings.support.type),
      support_style: supportStyle(settings.support.style),
      support_threshold_angle: String(settings.support.threshold),
      support_on_build_plate_only: settings.support.onPlateOnly ? "1" : "0",
      support_critical_regions_only: settings.support.criticalOnly ? "1" : "0",
      support_top_z_distance: String(settings.support.topZ),
      support_object_xy_distance: String(settings.support.xy),
      support_interface_top_layers: String(settings.support.interfaceLayers),
      support_interface_spacing: String(settings.support.interfaceSpacing),
    });
  }
  if (decisions.has("brim")) {
    overrides.brim_type = settings.brim.startsWith("Bordure") ? "outer_only" : settings.brim.startsWith("Aucune") ? "no_brim" : "auto_brim";
    if (settings.brim.startsWith("Bordure")) overrides.brim_width = "5";
  }
  if (decisions.has("ironing")) {
    overrides.ironing_type = ironingEnabled ? "top" : "no ironing";
    if (ironingEnabled) Object.assign(overrides, {
      ironing_pattern: "zig-zag",
      ironing_speed: "30",
      ironing_flow: "25%",
      ironing_spacing: "0.15",
    });
  }
  if (decisions.has("texture") && settings.texture.action === "disable") {
    overrides.fuzzy_skin = "none";
  }
  if (decisions.has("texture") && settings.texture.action === "global" && settings.texture.thickness != null && settings.texture.pointDistance != null) {
    Object.assign(overrides, {
      fuzzy_skin: settings.texture.fuzzySkin,
      fuzzy_skin_thickness: String(settings.texture.thickness),
      fuzzy_skin_point_distance: String(settings.texture.pointDistance),
      fuzzy_skin_first_layer: settings.texture.firstLayer ? "1" : "0",
    });
  }
  return overrides;
}

function projectConfig(settings: CrealityProjectSettings, filament: ExportFilament, nozzle: string, decisions?: ExportDecision[], source?: Existing3mfSource) {
  const officialProcess = processPreset(settings.layer, nozzle);
  const officialFilament = filamentPreset(filament.family, nozzle);
  const overrides = conservativeProcessOverrides(settings, nozzle, decisions);
  const base = source ? { ...source.projectSettings } : completeCrealityHiProcessProfile(settings.layer);
  const previousDifferences = Array.isArray(base.different_settings_to_system) ? base.different_settings_to_system.map(String) : ["", "", ""];
  while (previousDifferences.length < 3) previousDifferences.push("");
  const declared = new Set(previousDifferences[0].split(";").filter(Boolean));
  Object.keys(overrides).forEach(key => declared.add(key));
  const config: Record<string, unknown> = {
    ...base,
    version: "7.2.1",
    name: "project_settings",
    from: "project",
    printer_settings_id: source ? base.printer_settings_id ?? `Creality Hi ${nozzle} nozzle` : `Creality Hi ${nozzle} nozzle`,
    print_settings_id: source ? base.print_settings_id ?? officialProcess : officialProcess,
    filament_settings_id: source ? base.filament_settings_id ?? [officialFilament] : [officialFilament],
    ...overrides,
    // Creality Print intentionally restores every value from the named system
    // preset unless the project explicitly lists which keys are different.
    // Entry 0 is the process profile, entry 1 the sole filament and entry 2
    // the printer profile.
    different_settings_to_system: [Array.from(declared).join(";"), ...previousDifferences.slice(1)],
  };
  return { config, overrides };
}

function modelXml(name: string, triangles: ExportTriangle[]) {
  const vertexMap = new Map<string, number>();
  const vertices: Vec3[] = [];
  const indexes: [number, number, number][] = [];
  const mins: Vec3 = [Infinity, Infinity, Infinity];
  const maxs: Vec3 = [-Infinity, -Infinity, -Infinity];
  const indexFor = (vertex: Vec3) => {
    const key = `${vertex[0]},${vertex[1]},${vertex[2]}`;
    const existing = vertexMap.get(key);
    if (existing != null) return existing;
    const index = vertices.length;
    vertexMap.set(key, index);
    vertices.push(vertex);
    vertex.forEach((value, axis) => {
      mins[axis] = Math.min(mins[axis], value);
      maxs[axis] = Math.max(maxs[axis], value);
    });
    return index;
  };
  triangles.forEach(triangle => indexes.push([indexFor(triangle.a), indexFor(triangle.b), indexFor(triangle.c)]));
  const tx = 130 - (mins[0] + maxs[0]) / 2;
  const ty = 130 - (mins[1] + maxs[1]) / 2;
  const tz = -mins[2];
  const verticesXml = vertices.map(vertex => `    <vertex x="${vertex[0]}" y="${vertex[1]}" z="${vertex[2]}"/>`).join("\n");
  const trianglesXml = indexes.map(index => `    <triangle v1="${index[0]}" v2="${index[1]}" v3="${index[2]}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="fr-FR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
 <metadata name="Application">Creality_Print V7.2.1</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Title">${xml(name)}</metadata>
 <metadata name="Designer">PrintPilot Hi</metadata>
 <resources>
  <object id="1" type="model" name="${xml(name)}">
   <mesh>
    <vertices>
${verticesXml}
    </vertices>
    <triangles>
${trianglesXml}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="1" transform="1 0 0 0 1 0 0 0 1 ${tx} ${ty} ${tz}" printable="1"/>
 </build>
</model>`;
}

function modelConfig(name: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="name" value="${xml(name)}"/>
    <part id="1" subtype="normal_part">
      <metadata key="name" value="${xml(name)}"/>
      <metadata key="matrix" value="1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0"/>
      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="PrintPilot · ${xml(name)}"/>
    <metadata key="locked" value="false"/>
    <model_instance>
      <metadata key="object_id" value="1"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="1"/>
    </model_instance>
  </plate>
  <assemble></assemble>
</config>`;
}

export function verifyCrealityProjectArchive(bytes: Uint8Array, expected: Record<string, string>): ProjectVerification {
  const errors: string[] = [];
  let config: Record<string, unknown> = {};
  try {
    const entries = unzipSync(bytes);
    const raw = entries["Metadata/project_settings.config"];
    if (!raw) throw new Error("Metadata/project_settings.config absent");
    config = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Archive 3MF illisible");
  }
  const differences = Array.isArray(config.different_settings_to_system) ? String(config.different_settings_to_system[0] ?? "").split(";") : [];
  const applied = Object.entries(expected).map(([key, value]) => {
    const actual = config[key] == null ? null : String(config[key]);
    const declared = differences.includes(key);
    if (actual !== value) errors.push(`${key}: attendu ${value}, trouvé ${actual ?? "absent"}`);
    if (!declared) errors.push(`${key}: surcharge non déclarée`);
    return { key, expected: value, actual, declared };
  });
  return { passed: errors.length === 0, applied, errors };
}

export function buildCrealityProject(params: {
  modelName: string;
  triangles: ExportTriangle[];
  nozzle: string;
  settings: CrealityProjectSettings;
  filament: ExportFilament;
  decisions?: ExportDecision[];
  source3mf?: Existing3mfSource;
}) {
  const name = safeName(params.modelName);
  const { config, overrides } = projectConfig(params.settings, params.filament, params.nozzle, params.decisions, params.source3mf);
  const manifest = encoder.encode(JSON.stringify({
    generator: "PrintPilot Hi",
    exportVersion: 7,
    policy: params.source3mf ? "preserve-original-3mf-plus-selected-overrides" : "full-official-profile-plus-selected-overrides",
    generatedAt: new Date().toISOString(),
    orientation: params.source3mf ? "Orientation et structure du 3MF original conservées" : "Coordonnées du STL conservées ; Z minimum posé sur le plateau",
    filament: params.filament.label,
    officialBaseProfile: processPreset(params.settings.layer, params.nozzle),
    officialBaseLayer: normalizeCrealityHiLayer(params.settings.layer),
    officialFilamentProfile: filamentPreset(params.filament.family, params.nozzle),
    appliedProcessOverrides: overrides,
    declaredProcessDifferences: Object.keys(overrides),
    preservedOriginalProject: Boolean(params.source3mf),
    unchangedOfficialSections: ["prime_tower", "purge", "retraction", "cooling", "seam", "line_widths", "bed_type", "print_sequence"],
    filamentCalibrationExported: false,
    settings: params.settings,
  }, null, 2));

  if (params.source3mf) {
    const entries = unzipSync(params.source3mf.archive);
    entries["Metadata/project_settings.config"] = encoder.encode(JSON.stringify(config, null, 4));
    entries["Metadata/printpilot.json"] = manifest;
    const bytes = zipSync(entries, { level: 6 });
    const verification = verifyCrealityProjectArchive(bytes, overrides);
    if (!verification.passed) throw new Error(`Le contrôle interne du 3MF a échoué : ${verification.errors.join(" · ")}`);
    return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: "model/3mf" }), filename: `${name}_PrintPilot_v7_projet_conserve_CrealityHi.3mf`, appliedKeys: Object.keys(overrides), verification };
  }

  const entries: Record<string, Uint8Array> = {
    "[Content_Types].xml": encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>`),
    "_rels/.rels": encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>`),
    "3D/3dmodel.model": encoder.encode(modelXml(name, params.triangles)),
    "Metadata/model_settings.config": encoder.encode(modelConfig(name)),
    "Metadata/project_settings.config": encoder.encode(JSON.stringify(config, null, 4)),
    "Metadata/printpilot.json": manifest,
  };
  const bytes = zipSync(entries, { level: 6 });
  const verification = verifyCrealityProjectArchive(bytes, overrides);
  if (!verification.passed) throw new Error(`Le contrôle interne du 3MF a échoué : ${verification.errors.join(" · ")}`);
  return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: "model/3mf" }), filename: `${name}_PrintPilot_v7_reglages_selectionnes_CrealityHi.3mf`, appliedKeys: Object.keys(overrides), verification };
}
