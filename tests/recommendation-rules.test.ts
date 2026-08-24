import assert from "node:assert/strict";
import { assessBrim, assessSupport, selectLayerProfile, type GeometrySignals } from "../app/recommendationRules";

const geometry = (patch: Partial<GeometrySignals> = {}): GeometrySignals => ({
  size: [40, 40, 20],
  overhangPercent: 0,
  overhangAreaMm2: 0,
  baseScore: 50,
  bedContactAreaMm2: 1600,
  ...patch,
});

assert.equal(assessBrim({ geometry: geometry({ size: [200, 200, 2], bedContactAreaMm2: 40_000 }), material: "PLA", shapeClass: "broad", speedPrint: false }).action, "none");
assert.equal(assessBrim({ geometry: geometry({ size: [10, 10, 100], bedContactAreaMm2: 80, baseScore: 4 }), material: "PLA", shapeClass: "tall", speedPrint: false }).action, "outer");
assert.equal(assessBrim({ geometry: null, material: "PLA", shapeClass: "prismatic", speedPrint: false }).action, "preserve");
assert.equal(assessBrim({ geometry: geometry(), material: "ABS", shapeClass: "prismatic", speedPrint: false }).action, "preserve");

assert.equal(assessSupport({ geometry: geometry(), shapeClass: "prismatic", supportAccess: "easy" }).action, "disable");
assert.equal(assessSupport({ geometry: geometry({ overhangPercent: 8, overhangAreaMm2: 600 }), shapeClass: "organic", supportAccess: "easy" }).action, "enable");
assert.equal(assessSupport({ geometry: geometry({ overhangPercent: 8, overhangAreaMm2: 600 }), shapeClass: "cavity", supportAccess: "closed" }).action, "manual");
assert.equal(assessSupport({ geometry: geometry({ overhangPercent: 8, overhangAreaMm2: 600 }), shapeClass: "prismatic", supportAccess: "easy", objectCount: 2 }).action, "manual");

assert.deepEqual(selectLayerProfile({ objective: "speed", precision: "rough", featureSize: "normal", nozzle: "0.4", filamentCalibrated: false, maxVolumetricSpeed: null }).layer, "0,24 mm");
assert.deepEqual(selectLayerProfile({ objective: "speed", precision: "rough", featureSize: "normal", nozzle: "0.4", filamentCalibrated: true, maxVolumetricSpeed: 18 }).layer, "0,28 mm");
assert.deepEqual(selectLayerProfile({ objective: "quality", precision: "fine", featureSize: "micro", nozzle: "0.4", filamentCalibrated: true, maxVolumetricSpeed: 18 }).layer, "0,08 mm");

console.log("recommendation rules: ok");
