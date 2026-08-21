import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { filaments } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

const INITIAL_FILAMENTS = [
  ["Bambu Lab", "PLA Basic", "PLA", "Noir", "#171918"],
  ["Bambu Lab", "PLA Basic", "PLA", "Blanc jade", "#e8eee5"],
  ["Bambu Lab", "PLA Basic", "PLA", "Beige", "#d8c5a6"],
  ["Bambu Lab", "PLA Matte", "PLA Matte", "Blanc cassé", "#ece9df"],
  ["Bambu Lab", "PLA Matte", "PLA Matte", "Vert foncé", "#234b38"],
  ["Bambu Lab", "PLA Matte", "PLA Matte", "Bleu foncé", "#213a5b"],
  ["Bambu Lab", "PLA Matte", "PLA Matte", "Brun désert", "#927054"],
  ["Bambu Lab", "PLA Matte", "PLA Matte", "Terre cuite", "#a9523d"],
  ["Bambu Lab", "PETG Basic", "PETG", "Blanc", "#f3f4ef"],
  ["Bambu Lab", "PLA Wood", "PLA Wood", "Palissandre", "#67442f"],
] as const;

function numberOrNull(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur inattendue";
  return message.includes("no such table") ? "La base d’inventaire n’est pas encore initialisée." : message;
}

async function requireUser() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  return user;
}

export async function GET() {
  try {
    const user = await requireUser();
    const db = await getDb();
    let rows = await db.select().from(filaments).where(eq(filaments.userEmail, user.email)).orderBy(desc(filaments.updatedAt));
    if (rows.length === 0) {
      const now = new Date().toISOString();
      const seedRows = INITIAL_FILAMENTS.map(([brand, productLine, material, colorName, colorHex]) => ({
        userEmail: user.email, brand, productLine, material, colorName, colorHex,
        profileName: null, calibrated: false, abrasive: material === "PLA Wood", cfsCompatible: material !== "PLA Wood",
        notes: material === "PLA Wood" ? "À calibrer ; vérifier la buse et le débit." : "À calibrer.", createdAt: now, updatedAt: now,
      }));

      // D1 accepte au maximum 100 paramètres liés par requête. Les 10 lignes
      // dépassent cette limite lorsqu'elles sont insérées en une seule fois.
      // `batch` exécute les deux petites insertions dans une même transaction.
      await db.batch([
        db.insert(filaments).values(seedRows.slice(0, 5)),
        db.insert(filaments).values(seedRows.slice(5)),
      ]);
      rows = await db.select().from(filaments).where(eq(filaments.userEmail, user.email)).orderBy(desc(filaments.updatedAt));
    }
    return Response.json({ filaments: rows });
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = await request.json() as Record<string, unknown>;
    const brand = String(data.brand ?? "").trim(), productLine = String(data.productLine ?? "").trim(), material = String(data.material ?? "").trim(), colorName = String(data.colorName ?? "").trim();
    if (!brand || !productLine || !material || !colorName) return Response.json({ error: "Marque, gamme, matière et couleur sont obligatoires." }, { status: 400 });
    const now = new Date().toISOString(), db = await getDb();
    const [row] = await db.insert(filaments).values({
      userEmail: user.email, brand, productLine, material, colorName,
      colorHex: String(data.colorHex ?? "").trim() || null, spoolWeightG: numberOrNull(data.spoolWeightG), remainingG: numberOrNull(data.remainingG), pricePerKg: numberOrNull(data.pricePerKg), lotNumber: String(data.lotNumber ?? "").trim() || null,
      supplier: String(data.supplier ?? "").trim() || null, purchaseDate: String(data.purchaseDate ?? "").trim() || null, invoiceNumber: String(data.invoiceNumber ?? "").trim() || null,
      purchaseTotal: numberOrNull(data.purchaseTotal), purchaseQuantity: numberOrNull(data.purchaseQuantity), cfsSlot: String(data.cfsSlot ?? "").trim() || null, nozzleDiameter: numberOrNull(data.nozzleDiameter), lastDriedAt: String(data.lastDriedAt ?? "").trim() || null,
      openedAt: String(data.openedAt ?? "").trim() || null, storageLocation: String(data.storageLocation ?? "").trim() || null, storageHumidity: numberOrNull(data.storageHumidity), profileName: String(data.profileName ?? "").trim() || null,
      nozzleTempMin: numberOrNull(data.nozzleTempMin), nozzleTempMax: numberOrNull(data.nozzleTempMax), bedTempMin: numberOrNull(data.bedTempMin), bedTempMax: numberOrNull(data.bedTempMax), maxVolumetricSpeed: numberOrNull(data.maxVolumetricSpeed),
      flowRatio: numberOrNull(data.flowRatio), pressureAdvance: numberOrNull(data.pressureAdvance), dryingTemp: numberOrNull(data.dryingTemp), dryingHours: numberOrNull(data.dryingHours),
      cfsCompatible: bool(data.cfsCompatible, true), abrasive: bool(data.abrasive, false), calibrated: bool(data.calibrated, false), notes: String(data.notes ?? "").trim() || null, createdAt: now, updatedAt: now,
    }).returning();
    return Response.json({ filament: row }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const data = await request.json() as Record<string, unknown>; const id = Number(data.id);
    if (!Number.isInteger(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
    const editable = ["brand","productLine","material","colorName","colorHex","lotNumber","openedAt","storageLocation","profileName","notes","supplier","purchaseDate","invoiceNumber","cfsSlot","lastDriedAt"] as const;
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    editable.forEach(key => { if (key in data) update[key] = String(data[key] ?? "").trim() || null; });
    const numeric = ["spoolWeightG","remainingG","pricePerKg","storageHumidity","nozzleTempMin","nozzleTempMax","bedTempMin","bedTempMax","maxVolumetricSpeed","flowRatio","pressureAdvance","dryingTemp","dryingHours","purchaseTotal","purchaseQuantity","nozzleDiameter"] as const;
    numeric.forEach(key => { if (key in data) update[key] = numberOrNull(data[key]); });
    (["cfsCompatible","abrasive","calibrated"] as const).forEach(key => { if (key in data) update[key] = bool(data[key], false); });
    const db = await getDb();
    const [row] = await db.update(filaments).set(update).where(and(eq(filaments.id, id), eq(filaments.userEmail, user.email))).returning();
    return row ? Response.json({ filament: row }) : Response.json({ error: "Bobine introuvable." }, { status: 404 });
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(); const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
    const db = await getDb();
    const [row] = await db.delete(filaments).where(and(eq(filaments.id, id), eq(filaments.userEmail, user.email))).returning({ id: filaments.id });
    return row ? Response.json({ deleted: row.id }) : Response.json({ error: "Bobine introuvable." }, { status: 404 });
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500;
    return Response.json({ error: errorMessage(error) }, { status });
  }
}
