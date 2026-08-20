import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { buildCrealityProject } from "../app/threeMfExport";

const v = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
const triangles = [
  { a: v(0, 0, 0), b: v(20, 0, 0), c: v(20, 20, 0) }, { a: v(0, 0, 0), b: v(20, 20, 0), c: v(0, 20, 0) },
  { a: v(0, 0, 20), b: v(20, 20, 20), c: v(20, 0, 20) }, { a: v(0, 0, 20), b: v(0, 20, 20), c: v(20, 20, 20) },
  { a: v(0, 0, 0), b: v(0, 0, 20), c: v(20, 0, 20) }, { a: v(0, 0, 0), b: v(20, 0, 20), c: v(20, 0, 0) },
  { a: v(20, 0, 0), b: v(20, 0, 20), c: v(20, 20, 20) }, { a: v(20, 0, 0), b: v(20, 20, 20), c: v(20, 20, 0) },
  { a: v(20, 20, 0), b: v(20, 20, 20), c: v(0, 20, 20) }, { a: v(20, 20, 0), b: v(0, 20, 20), c: v(0, 20, 0) },
  { a: v(0, 20, 0), b: v(0, 20, 20), c: v(0, 0, 20) }, { a: v(0, 20, 0), b: v(0, 0, 20), c: v(0, 0, 0) },
];

const project = buildCrealityProject({
  modelName: "cube-test.stl",
  triangles,
  nozzle: "0.4",
  filament: { label: "PLA test", family: "PLA", brand: "Generic" },
  settings: {
    layer: "0,12 mm", walls: 4, topLayers: 5, bottomLayers: 5, infill: 25, infillPattern: "Gyroïde",
    outerWallSpeed: 150, innerWallSpeed: 350, infillSpeed: 400, topSpeed: 200, acceleration: 6000, brim: "Bordure 5 mm", ironing: "Toutes les surfaces supérieures",
    support: { enabled: true, type: "Arborescents (auto)", style: "Arborescents Organiques", threshold: 40, onPlateOnly: true, criticalOnly: false, topZ: 0.24, xy: 0.35, interfaceLayers: 4, interfaceSpacing: 0.25 },
  },
});

const bytes = new Uint8Array(await project.blob.arrayBuffer());
const archiveText = new TextDecoder().decode(bytes);

assert.equal(project.filename, "cube-test_PrintPilot_v4_profil_complet_CrealityHi.3mf");
assert.match(archiveText, /"print_settings_id": "0\.12mm Standard @Creality Hi 0\.4 nozzle"/);
assert.match(archiveText, /"line_width": "0\.42"/);
assert.match(archiveText, /"inner_wall_line_width": "0\.45"/);
assert.match(archiveText, /"top_surface_line_width": "0\.42"/);
assert.match(archiveText, /"seam_gap": "15%"/);
assert.match(archiveText, /"staggered_inner_seams": "1"/);
assert.match(archiveText, /"enable_prime_tower": "1"/);
assert.match(archiveText, /"wall_loops": "4"/);
assert.match(archiveText, /"sparse_infill_density": "25%"/);
assert.match(archiveText, /"enable_support": "1"/);
assert.doesNotMatch(archiveText, /Metadata\/process_settings_1\.config/);
assert.doesNotMatch(archiveText, /Metadata\/filament_settings_1\.config/);

if (process.argv[2]) await writeFile(process.argv[2], bytes);
