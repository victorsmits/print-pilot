"use client";

export type PrintRun = {
  id: number;
  name: string;
  sourceFileName?: string | null;
  filamentId?: number | null;
  durationMinutes?: number | null;
  filamentUsedG?: number | null;
  totalCost?: number | null;
  outcome: "success" | "mixed" | "failed";
  qualityRating?: number | null;
  defects?: string | null;
  notes?: string | null;
  createdAt: string;
};

const OUTCOME = { success: "Réussie", mixed: "À améliorer", failed: "Échec" } as const;

export default function PrintHistoryPanel({ prints, loading, onClose }: { prints: PrintRun[]; loading: boolean; onClose: () => void }) {
  const successes = prints.filter(run => run.outcome === "success").length;
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="history-drawer" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
    <div className="drawer-head"><div><span className="eyebrow">MÉMOIRE D’IMPRESSION</span><h2>Historique réel</h2></div><button className="icon-button" onClick={onClose}>×</button></div>
    <div className="history-summary"><div><b>{prints.length}</b><span>impressions</span></div><div><b>{successes}</b><span>réussies</span></div><div><b>{prints.length ? Math.round(successes / prints.length * 100) : 0}%</b><span>réussite</span></div></div>
    {loading ? <p>Chargement…</p> : prints.length === 0 ? <div className="history-empty"><b>Aucune impression enregistrée</b><p>Après une impression, note simplement le résultat, la qualité et les défauts observés.</p></div> : <div className="history-list">{prints.map(run => <article key={run.id} className={`history-run ${run.outcome}`}><div><span>{new Date(run.createdAt).toLocaleDateString("fr-FR")}</span><b>{run.name}</b><small>{run.sourceFileName ?? "Projet sans fichier"}</small></div><footer><b>{OUTCOME[run.outcome]}</b><span>{run.qualityRating ? `${"★".repeat(run.qualityRating)}${"☆".repeat(5 - run.qualityRating)}` : "Non notée"}</span></footer>{(run.defects || run.notes) && <p>{[run.defects, run.notes].filter(Boolean).join(" · ")}</p>}</article>)}</div>}
  </aside></div>;
}
