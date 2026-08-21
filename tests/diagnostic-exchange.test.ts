import assert from "node:assert/strict";
import { agentPrompt, binaryStl, parsePrintPilotExchange, type PrintPilotExchange } from "../app/diagnosticExchange";

const configuration: PrintPilotExchange = {
  format: "printpilot-configuration", version: 1, generatedAt: new Date(0).toISOString(),
  source: { fileName: "test.stl", fingerprint: "abc", kind: "stl", orientationId: "current" },
  machine: { printer: "Creality Hi", nozzleMm: "0.4" }, filament: { label: "PLA test" }, criteria: { useCase: "functional" },
  geometry: { sizeMm: [20, 20, 20] }, imported3mf: null, recommendation: { layer: "0,20 mm", walls: 4, infill: 25 }, selectedDecisions: ["walls"],
  printResult: { outcome: "mixed", defects: "dessus irrégulier", notes: "" },
};

assert.equal(parsePrintPilotExchange(JSON.stringify(configuration)).source.fingerprint, "abc");
assert.throws(() => parsePrintPilotExchange('{"format":"other","version":1}'), /Format non reconnu/);
assert.match(agentPrompt(configuration), /dessus irrégulier/);
const stl = binaryStl("test", [{ a: [0,0,0], b: [1,0,0], c: [0,1,0], normal: [0,0,1] }]);
assert.equal((await stl.arrayBuffer()).byteLength, 134);
