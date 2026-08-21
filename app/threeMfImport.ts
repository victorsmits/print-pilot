"use client";

import { strFromU8, unzipSync } from "fflate";

export type ImportedVec3 = [number, number, number];
export type ImportedTriangle = { a: ImportedVec3; b: ImportedVec3; c: ImportedVec3; normal: ImportedVec3; area: number };

export type Imported3mfProject = {
  archive: Uint8Array;
  triangles: ImportedTriangle[];
  projectSettings: Record<string, unknown>;
  printerProfile: string | null;
  processProfile: string | null;
  filamentProfiles: string[];
  objectCount: number;
  plateCount: number;
  sourceApplication: string | null;
};

type Transform = number[];

const identity = (): Transform => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function parseTransform(value: string | null): Transform {
  const numbers = (value ?? "").trim().split(/\s+/).map(Number);
  return numbers.length === 12 && numbers.every(Number.isFinite) ? numbers : identity();
}

function applyTransform(point: ImportedVec3, transform: Transform): ImportedVec3 {
  const [x, y, z] = point;
  return [
    x * transform[0] + y * transform[3] + z * transform[6] + transform[9],
    x * transform[1] + y * transform[4] + z * transform[7] + transform[10],
    x * transform[2] + y * transform[5] + z * transform[8] + transform[11],
  ];
}

function triangle(a: ImportedVec3, b: ImportedVec3, c: ImportedVec3): ImportedTriangle {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cross: ImportedVec3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const length = Math.hypot(...cross) || 1;
  return { a, b, c, normal: [cross[0] / length, cross[1] / length, cross[2] / length], area: length / 2 };
}

function firstEntry(entries: Record<string, Uint8Array>, suffix: string) {
  const key = Object.keys(entries).find(name => name.toLowerCase().endsWith(suffix.toLowerCase()));
  return key ? entries[key] : null;
}

export function read3mfProject(buffer: ArrayBuffer): Imported3mfProject {
  const archive = new Uint8Array(buffer);
  const entries = unzipSync(archive);
  const modelBytes = entries["3D/3dmodel.model"] ?? firstEntry(entries, ".model");
  if (!modelBytes) throw new Error("Ce 3MF ne contient pas de modèle 3D exploitable.");

  const xml = new DOMParser().parseFromString(strFromU8(modelBytes), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Le modèle 3MF est illisible.");
  const objects = new Map<string, Element>();
  xml.querySelectorAll("resources > object").forEach(object => objects.set(object.getAttribute("id") ?? "", object));
  const triangles: ImportedTriangle[] = [];

  function collect(objectId: string, transforms: Transform[], depth = 0) {
    if (depth > 20) throw new Error("Le 3MF contient une hiérarchie d’objets circulaire.");
    const object = objects.get(objectId);
    if (!object) return;
    const mesh = object.querySelector(":scope > mesh");
    if (mesh) {
      const vertices = [...mesh.querySelectorAll("vertices > vertex")].map(vertex => [
        Number(vertex.getAttribute("x")), Number(vertex.getAttribute("y")), Number(vertex.getAttribute("z")),
      ] as ImportedVec3);
      const transformed = vertices.map(vertex => transforms.reduce((value, transform) => applyTransform(value, transform), vertex));
      mesh.querySelectorAll("triangles > triangle").forEach(node => {
        const a = transformed[Number(node.getAttribute("v1"))], b = transformed[Number(node.getAttribute("v2"))], c = transformed[Number(node.getAttribute("v3"))];
        if (a && b && c) triangles.push(triangle(a, b, c));
      });
    }
    object.querySelectorAll(":scope > components > component").forEach(component => {
      const childId = component.getAttribute("objectid");
      if (childId) collect(childId, [parseTransform(component.getAttribute("transform")), ...transforms], depth + 1);
    });
  }

  const buildItems = [...xml.querySelectorAll("build > item")];
  buildItems.forEach(item => {
    const objectId = item.getAttribute("objectid");
    if (objectId) collect(objectId, [parseTransform(item.getAttribute("transform"))]);
  });
  if (!triangles.length) throw new Error("Le 3MF ne contient aucun triangle exploitable.");

  const settingsBytes = entries["Metadata/project_settings.config"];
  let projectSettings: Record<string, unknown> = {};
  if (settingsBytes) {
    try { projectSettings = JSON.parse(strFromU8(settingsBytes)) as Record<string, unknown>; }
    catch { throw new Error("La géométrie est lisible, mais les réglages du projet 3MF sont endommagés."); }
  }
  const filamentValue = projectSettings.filament_settings_id;
  const plateConfig = entries["Metadata/model_settings.config"];
  const plateCount = plateConfig ? Math.max(1, (strFromU8(plateConfig).match(/<plate(?:\s|>)/g) ?? []).length) : 1;
  const application = [...xml.querySelectorAll("metadata")].find(node => node.getAttribute("name") === "Application")?.textContent ?? null;

  return {
    archive,
    triangles,
    projectSettings,
    printerProfile: typeof projectSettings.printer_settings_id === "string" ? projectSettings.printer_settings_id : null,
    processProfile: typeof projectSettings.print_settings_id === "string" ? projectSettings.print_settings_id : null,
    filamentProfiles: Array.isArray(filamentValue) ? filamentValue.map(String) : [],
    objectCount: buildItems.length || objects.size,
    plateCount,
    sourceApplication: application,
  };
}

export function settingString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  if (Array.isArray(value)) return value.map(String).join(", ");
  return value == null ? null : String(value);
}
