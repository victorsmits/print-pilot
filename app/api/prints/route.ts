import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { printRuns } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

function numberOrNull(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    const rows = await db.select().from(printRuns).where(eq(printRuns.userEmail, user.email)).orderBy(desc(printRuns.createdAt)).limit(100);
    return Response.json({ prints: rows });
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Erreur inattendue" }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = await request.json() as Record<string, unknown>;
    const name = String(data.name ?? "").trim();
    const outcome = String(data.outcome ?? "").trim();
    if (!name || !["success", "mixed", "failed"].includes(outcome)) return Response.json({ error: "Nom et résultat d’impression obligatoires." }, { status: 400 });
    const db = await getDb();
    const [row] = await db.insert(printRuns).values({
      userEmail: user.email,
      name,
      sourceFileName: String(data.sourceFileName ?? "").trim() || null,
      filamentId: numberOrNull(data.filamentId),
      durationMinutes: numberOrNull(data.durationMinutes),
      filamentUsedG: numberOrNull(data.filamentUsedG),
      materialCost: numberOrNull(data.materialCost),
      energyCost: numberOrNull(data.energyCost),
      totalCost: numberOrNull(data.totalCost),
      outcome,
      qualityRating: numberOrNull(data.qualityRating),
      defects: String(data.defects ?? "").trim() || null,
      notes: String(data.notes ?? "").trim() || null,
      settingsJson: JSON.stringify(data.settings ?? {}),
      createdAt: new Date().toISOString(),
    }).returning();
    return Response.json({ print: row }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Erreur inattendue" }, { status });
  }
}
