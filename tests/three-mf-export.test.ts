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
    layer: "0,20 mm", walls: 3, topLayers: 5, bottomLayers: 3, infill: 15, infillPattern: "Cubique adaptatif",
    outerWallSpeed: 150, innerWallSpeed: 300, infillSpeed: 270, topSpeed: 200, acceleration: 6000, brim: "Auto / aucune", ironing: "Désactivé",
    support: { enabled: false, type: "Normaux (auto)", style: "Défaut", threshold: 30, onPlateOnly: false, criticalOnly: false, topZ: 0.2, xy: 0.35, interfaceLayers: 3, interfaceSpacing: 0.5 },
  },
});

await writeFile(process.argv[2], new Uint8Array(await project.blob.arrayBuffer()));
