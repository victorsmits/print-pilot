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
  decisions: ["layer", "walls", "shells", "infill", "support", "brim", "ironing", "texture"],
  settings: {
    layer: "0,12 mm", walls: 4, topLayers: 5, bottomLayers: 5, infill: 25, infillPattern: "Gyroïde",
    outerWallSpeed: 150, innerWallSpeed: 350, infillSpeed: 400, topSpeed: 200, acceleration: 6000, brim: "Aucune bordure", ironing: "Toutes les surfaces supérieures",
    texture: { action: "global", label: "Fine", fuzzySkin: "external", thickness: 0.12, pointDistance: 0.8, firstLayer: false },
    support: { enabled: true, type: "Arborescents (auto)", style: "Arborescents Organiques", threshold: 40, onPlateOnly: true, criticalOnly: false, topZ: 0.24, xy: 0.35, interfaceLayers: 4, interfaceSpacing: 0.25 },
  },
});

const bytes = new Uint8Array(await project.blob.arrayBuffer());
const entries = unzipSync(bytes);
const config = JSON.parse(strFromU8(entries["Metadata/project_settings.config"]));
const declared = String(config.different_settings_to_system[0]).split(";");

assert.equal(project.filename, "cube-test_PrintPilot_v7_reglages_selectionnes_CrealityHi.3mf");
assert.equal(config.print_settings_id, "0.12mm Standard @Creality Hi 0.4 nozzle");
assert.equal(config.line_width, "0.42");
assert.equal(config.inner_wall_line_width, "0.45");
assert.equal(config.top_surface_line_width, "0.42");
assert.equal(config.seam_gap, "15%");
assert.equal(config.staggered_inner_seams, "1");
assert.equal(config.enable_prime_tower, "1", "la tour de purge du profil officiel reste intacte");
assert.equal(config.wall_loops, "4");
assert.equal(config.sparse_infill_density, "25%");
assert.equal(config.enable_support, "1");
assert.equal(config.brim_type, "no_brim", "une base stable doit pouvoir désactiver explicitement la bordure");
assert.equal(config.fuzzy_skin, "external");
assert.equal(config.fuzzy_skin_thickness, "0.12");
assert.equal(config.fuzzy_skin_point_distance, "0.8");
assert.equal(config.fuzzy_skin_first_layer, "0");
for (const key of ["layer_height", "wall_loops", "enable_support", "support_type", "fuzzy_skin", "fuzzy_skin_thickness", "fuzzy_skin_point_distance", "fuzzy_skin_first_layer"]) assert.ok(declared.includes(key), `${key} doit être déclaré comme surcharge`);
assert.equal(project.verification.passed, true);
assert.equal(project.verification.applied.find(item => item.key === "fuzzy_skin_thickness")?.actual, "0.12");
assert.equal(entries["Metadata/process_settings_1.config"], undefined);
assert.equal(entries["Metadata/filament_settings_1.config"], undefined);

const originalEntries = unzipSync(bytes);
originalEntries["Metadata/original-marker.txt"] = new TextEncoder().encode("conserver-moi");
const sourceProject = buildCrealityProject({
  modelName: "cube-source.3mf", triangles, nozzle: "0.4", filament: { label: "PLA test", family: "PLA" }, decisions: ["walls"],
  source3mf: { archive: zipSync(originalEntries), projectSettings: JSON.parse(strFromU8(originalEntries["Metadata/project_settings.config"])) },
  settings: {
    layer: "0,20 mm", walls: 5, topLayers: 5, bottomLayers: 3, infill: 15, infillPattern: "Cubique adaptatif",
    outerWallSpeed: 150, innerWallSpeed: 300, infillSpeed: 270, topSpeed: 200, acceleration: 6000, brim: "Auto / aucune", ironing: "Désactivé",
    texture: { action: "preserve", label: "Conserver", fuzzySkin: "none", thickness: null, pointDistance: null, firstLayer: false },
    support: { enabled: false, type: "Normaux (auto)", style: "Défaut", threshold: 30, onPlateOnly: false, criticalOnly: false, topZ: 0.2, xy: 0.35, interfaceLayers: 3, interfaceSpacing: 0.5 },
  },
});
const preserved = unzipSync(new Uint8Array(await sourceProject.blob.arrayBuffer()));
assert.equal(strFromU8(preserved["Metadata/original-marker.txt"]), "conserver-moi");
const preservedConfig = JSON.parse(strFromU8(preserved["Metadata/project_settings.config"]));
assert.equal(preservedConfig.wall_loops, "5");
assert.equal(preservedConfig.layer_height, "0.12", "une catégorie non cochée doit rester inchangée");

if (process.argv[2]) await writeFile(process.argv[2], bytes);
