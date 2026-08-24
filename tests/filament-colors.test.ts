import assert from "node:assert/strict";
import { resolveBambuColorHex } from "../app/filamentColors";

const petg = (colorName: string) => resolveBambuColorHex({ brand: "Bambu Lab", productLine: "PETG Basic", material: "PETG", colorName });

assert.equal(petg("Marron foncé"), "#4F2C1D");
assert.equal(petg("Vert sapin"), "#034638");
assert.equal(petg("Blanc"), "#FFFFFF");
assert.equal(petg("Noir"), "#000000");
assert.equal(resolveBambuColorHex({ brand: "Autre", productLine: "PETG Basic", colorName: "Noir" }), null);

console.log("Catalogue couleur Bambu : noms français et anglais reconnus");
