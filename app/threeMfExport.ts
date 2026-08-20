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

type ZipEntry = { name: string; data: Uint8Array };

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

function filamentType(family: string) {
  return family.toUpperCase().includes("PETG") ? "PETG" : "PLA";
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

function projectConfig(settings: CrealityProjectSettings, filament: ExportFilament, nozzle: string) {
  const layer = nozzle === "0.6" ? 0.3 : layerNumber(settings.layer);
  const filamentName = filamentPreset(filament.family, nozzle);
  const nozzleTemperature = filament.nozzleTempMax ?? filament.nozzleTempMin;
  const bedTemperature = filament.bedTempMax ?? filament.bedTempMin;
  const ironingEnabled = settings.ironing !== "Désactivé";
  const config: Record<string, string | string[]> = {
    version: "7.2.1",
    name: "project_settings",
    from: "project",
    printer_settings_id: `Creality Hi ${nozzle} nozzle`,
    print_settings_id: processPreset(settings.layer, nozzle),
    filament_settings_id: [filamentName],
    filament_type: [filamentType(filament.family)],
    filament_vendor: [filament.brand || "Generic"],
    filament_colour: [filament.colorHex || "#35D77D"],
    curr_bed_type: "Textured PEI Plate",
    print_sequence: "by layer",
    layer_height: String(layer),
    wall_loops: String(settings.walls),
    top_shell_layers: String(settings.topLayers),
    bottom_shell_layers: String(settings.bottomLayers),
    sparse_infill_density: `${settings.infill}%`,
    sparse_infill_pattern: infillPattern(settings.infillPattern),
    outer_wall_speed: String(settings.outerWallSpeed),
    inner_wall_speed: String(settings.innerWallSpeed),
    sparse_infill_speed: String(settings.infillSpeed),
    top_surface_speed: String(settings.topSpeed),
    default_acceleration: String(settings.acceleration),
    enable_support: settings.support.enabled ? "1" : "0",
    support_type: supportType(settings.support.type),
    support_style: supportStyle(settings.support.style),
    support_threshold_angle: String(settings.support.threshold),
    support_on_build_plate_only: settings.support.onPlateOnly ? "1" : "0",
    support_critical_regions_only: settings.support.criticalOnly ? "1" : "0",
    support_top_z_distance: String(settings.support.topZ),
    support_object_xy_distance: String(settings.support.xy),
    support_interface_top_layers: String(settings.support.interfaceLayers),
    support_interface_spacing: String(settings.support.interfaceSpacing),
    brim_type: settings.brim.startsWith("Bordure") ? "outer_only" : "auto_brim",
    brim_width: settings.brim.startsWith("Bordure") ? "5" : "0",
    ironing_type: ironingEnabled ? "top" : "no ironing",
    ironing_pattern: "zig-zag",
    ironing_speed: "30",
    ironing_flow: "25%",
    ironing_spacing: "0.15",
  };
  if (nozzleTemperature != null) {
    config.nozzle_temperature = [String(nozzleTemperature)];
    config.nozzle_temperature_initial_layer = [String(nozzleTemperature)];
  }
  if (bedTemperature != null) {
    config.hot_plate_temp = [String(bedTemperature)];
    config.hot_plate_temp_initial_layer = [String(bedTemperature)];
    config.textured_plate_temp = [String(bedTemperature)];
    config.textured_plate_temp_initial_layer = [String(bedTemperature)];
  }
  if (filament.maxVolumetricSpeed != null) config.filament_max_volumetric_speed = [String(filament.maxVolumetricSpeed)];
  if (filament.flowRatio != null) config.filament_flow_ratio = [String(filament.flowRatio)];
  if (filament.pressureAdvance != null) {
    config.enable_pressure_advance = ["1"];
    config.pressure_advance = [String(filament.pressureAdvance)];
  }
  return JSON.stringify(config, null, 4);
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
    <metadata key="bed_type" value="Textured PEI Plate"/>
    <metadata key="print_sequence" value="by layer"/>
    <model_instance>
      <metadata key="object_id" value="1"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="1"/>
    </model_instance>
  </plate>
  <assemble></assemble>
</config>`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number) { view.setUint32(offset, value, true); }

function zip(entries: ZipEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const local = new Uint8Array(30 + name.length + entry.data.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write32(localView, 14, checksum);
    write32(localView, 18, entry.data.length);
    write32(localView, 22, entry.data.length);
    write16(localView, 26, name.length);
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write32(centralView, 16, checksum);
    write32(centralView, 20, entry.data.length);
    write32(centralView, 24, entry.data.length);
    write16(centralView, 28, name.length);
    write32(centralView, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, entries.length);
  write16(endView, 10, entries.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, offset);
  return new Blob([...localParts, ...centralParts, end].map(part => part.buffer as ArrayBuffer), { type: "model/3mf" });
}

export function buildCrealityProject(params: {
  modelName: string;
  triangles: ExportTriangle[];
  nozzle: string;
  settings: CrealityProjectSettings;
  filament: ExportFilament;
}) {
  const name = safeName(params.modelName);
  const files: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>`),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>`),
    },
    { name: "3D/3dmodel.model", data: encoder.encode(modelXml(name, params.triangles)) },
    { name: "Metadata/model_settings.config", data: encoder.encode(modelConfig(name)) },
    { name: "Metadata/project_settings.config", data: encoder.encode(projectConfig(params.settings, params.filament, params.nozzle)) },
    {
      name: "Metadata/printpilot.json",
      data: encoder.encode(JSON.stringify({ generator: "PrintPilot Hi", generatedAt: new Date().toISOString(), orientation: "Coordonnées du STL conservées ; Z minimum posé sur le plateau", filament: params.filament.label, settings: params.settings }, null, 2)),
    },
  ];
  return { blob: zip(files), filename: `${name}_PrintPilot_CrealityHi.3mf` };
}
