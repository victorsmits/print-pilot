import assert from "node:assert/strict";
import { analyseMesh } from "../app/PrintPilotClient";

type Vec3 = [number, number, number];
const v = (x: number, y: number, z: number): Vec3 => [x, y, z];
const tri = (a: Vec3, b: Vec3, c: Vec3) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as Vec3;
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as Vec3;
  const cross: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const length = Math.hypot(...cross);
  return { a, b, c, normal: cross.map(value => value / length) as Vec3, area: length / 2 };
};

const p000 = v(0, 0, 0), p100 = v(20, 0, 0), p110 = v(20, 20, 0), p010 = v(0, 20, 0);
const p001 = v(0, 0, 20), p101 = v(20, 0, 20), p111 = v(20, 20, 20), p011 = v(0, 20, 20);
const cube = [
  tri(p000, p010, p110), tri(p000, p110, p100),
  tri(p001, p101, p111), tri(p001, p111, p011),
  tri(p000, p100, p101), tri(p000, p101, p001),
  tri(p100, p110, p111), tri(p100, p111, p101),
  tri(p110, p010, p011), tri(p110, p011, p111),
  tri(p010, p000, p001), tri(p010, p001, p011),
];

const result = analyseMesh("cube.stl", cube);
assert.equal(result.overhangAreaMm2, 0, "la face en contact avec le plateau ne doit pas compter comme support");
assert.equal(result.overhangPercent, 0, "un cube posé à plat ne doit pas demander de support");
process.stdout.write("Support analysis: cube posé à plat = 0 % de support\n");
