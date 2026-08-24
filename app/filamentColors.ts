type FilamentColorInput = {
  brand?: unknown;
  productLine?: unknown;
  material?: unknown;
  colorName?: unknown;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Références d'affichage publiées dans les tableaux HEX de Bambu Lab.
// Elles servent à l'interface ; la teinte physique peut varier avec le lot et la finition.
const BAMBU_COLORS: Record<string, Record<string, string>> = {
  "petg basic": {
    "rouge": "#D6001C", "red": "#D6001C",
    "orange": "#FF671F",
    "jaune": "#FCE300", "yellow": "#FCE300",
    "bleu reflex": "#001489", "reflex blue": "#001489",
    "bleu marine": "#0086D6", "navy blue": "#0086D6",
    "bleu brume": "#688197", "misty blue": "#688197",
    "vert": "#009639", "green": "#009639",
    "vert sapin": "#034638", "pine green": "#034638",
    "marron fonce": "#4F2C1D", "dark brown": "#4F2C1D",
    "beige fonce": "#DBC8B6", "dark beige": "#DBC8B6",
    "gris": "#7F7E83", "gray": "#7F7E83", "grey": "#7F7E83",
    "blanc": "#FFFFFF", "white": "#FFFFFF",
    "noir": "#000000", "black": "#000000",
  },
  "pla basic": {
    "blanc jade": "#FFFFFF", "jade white": "#FFFFFF",
    "beige": "#F7E6DE",
    "noir": "#000000", "black": "#000000",
    "marron": "#9D432C", "brown": "#9D432C",
    "marron cacao": "#6F5034", "cocoa brown": "#6F5034",
    "vert bambu": "#00AE42", "bambu green": "#00AE42",
    "vert gui": "#3F8E43", "mistletoe green": "#3F8E43",
    "bleu": "#0A2989", "blue": "#0A2989",
    "rouge": "#C12E1F", "red": "#C12E1F",
  },
  "pla matte": {
    "blanc ivoire": "#FFFFFF", "blanc casse": "#FFFFFF", "ivory white": "#FFFFFF",
    "brun desert": "#E8DBB7", "desert tan": "#E8DBB7",
    "terre cuite": "#B15533", "terracotta": "#B15533",
    "marron fonce": "#7D6556", "dark brown": "#7D6556",
    "chocolat fonce": "#4D3324", "dark chocolate": "#4D3324",
    "vert fonce": "#68724D", "dark green": "#68724D",
    "bleu fonce": "#042F56", "dark blue": "#042F56",
    "noir": "#000000", "charcoal": "#000000",
  },
  "pla wood": {
    "chene blanc": "#D6CCA3", "white oak": "#D6CCA3",
    "jaune ocre": "#C98935", "ochre yellow": "#C98935",
    "brun argile": "#995F11", "clay brown": "#995F11",
    "bouleau classique": "#918669", "classic birch": "#918669",
    "palissandre": "#4C241C", "rosewood": "#4C241C",
    "noyer noir": "#4F3F24", "black walnut": "#4F3F24",
  },
};

function familyKey(input: FilamentColorInput) {
  const line = normalize(input.productLine);
  if (line.includes("petg") && line.includes("basic")) return "petg basic";
  if (line.includes("pla") && line.includes("matte")) return "pla matte";
  if (line.includes("pla") && line.includes("wood")) return "pla wood";
  if (line.includes("pla") && line.includes("basic")) return "pla basic";
  const material = normalize(input.material);
  if (material === "pla matte") return "pla matte";
  if (material === "pla wood") return "pla wood";
  return "";
}

export function resolveBambuColorHex(input: FilamentColorInput): string | null {
  if (!normalize(input.brand).includes("bambu")) return null;
  const colors = BAMBU_COLORS[familyKey(input)];
  if (!colors) return null;
  return colors[normalize(input.colorName)] ?? null;
}

