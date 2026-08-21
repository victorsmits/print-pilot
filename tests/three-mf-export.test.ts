import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { buildCrealityProject } from "../app/threeMfExport";
import { strFromU8, unzipSync, zipSync } from "fflate";

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

assert.equal(project.filename, "cube-test_PrintPilot_v6_reglages_selectionnes_CrealityHi.3mf");
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
assert.match(archiveText, /"different_settings_to_system": \[/);
assert.match(archiveText, /layer_height;wall_loops;top_shell_layers;bottom_shell_layers;sparse_infill_density;sparse_infill_pattern;enable_support/);
assert.match(archiveText, /support_type;support_style;support_threshold_angle/);
assert.doesNotMatch(archiveText, /Metadata\/process_settings_1\.config/);
assert.doesNotMatch(archiveText, /Metadata\/filament_settings_1\.config/);

const originalEntries = unzipSync(bytes);
originalEntries["Metadata/original-marker.txt"] = new TextEncoder().encode("conserver-moi");
const sourceProject = buildCrealityProject({
  modelName: "cube-source.3mf", triangles, nozzle: "0.4", filament: { label: "PLA test", family: "PLA" }, decisions: ["walls"],
  source3mf: { archive: zipSync(originalEntries), projectSettings: JSON.parse(strFromU8(originalEntries["Metadata/project_settings.config"])) },
  settings: {
    layer: "0,20 mm", walls: 5, topLayers: 5, bottomLayers: 3, infill: 15, infillPattern: "Cubique adaptatif",
    outerWallSpeed: 150, innerWallSpeed: 300, infillSpeed: 270, topSpeed: 200, acceleration: 6000, brim: "Auto / aucune", ironing: "Désactivé",
    support: { enabled: false, type: "Normaux (auto)", style: "Défaut", threshold: 30, onPlateOnly: false, criticalOnly: false, topZ: 0.2, xy: 0.35, interfaceLayers: 3, interfaceSpacing: 0.5 },
  },
});
const preserved = unzipSync(new Uint8Array(await sourceProject.blob.arrayBuffer()));
assert.equal(strFromU8(preserved["Metadata/original-marker.txt"]), "conserver-moi");
const preservedConfig = JSON.parse(strFromU8(preserved["Metadata/project_settings.config"]));
assert.equal(preservedConfig.wall_loops, "5");
assert.equal(preservedConfig.layer_height, "0.12", "une catégorie non cochée doit rester inchangée");

if (process.argv[2]) await writeFile(process.argv[2], bytes);
