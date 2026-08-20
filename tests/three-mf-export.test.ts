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

await writeFile(process.argv[2], new Uint8Array(await project.blob.arrayBuffer()));
