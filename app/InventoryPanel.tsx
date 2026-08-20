"use client";

import { FormEvent, useMemo, useState } from "react";
import type { InventoryFilament } from "./PrintPilotClient";

type Props = { inventory: InventoryFilament[]; loading: boolean; onReload: () => Promise<void>; onClose: () => void };
type FormState = Record<string, string | boolean>;

const EMPTY: FormState = {
  brand: "", productLine: "", material: "PLA", colorName: "", colorHex: "#35d77d", spoolWeightG: "", remainingG: "", lotNumber: "", openedAt: "", storageLocation: "", storageHumidity: "", profileName: "", nozzleTempMin: "", nozzleTempMax: "", bedTempMin: "", bedTempMax: "", maxVolumetricSpeed: "", flowRatio: "", pressureAdvance: "", dryingTemp: "", dryingHours: "", cfsCompatible: true, abrasive: false, calibrated: false, notes: "",
};

function formFrom(row?: InventoryFilament): FormState {
  if (!row) return { ...EMPTY };
  const result: FormState = { ...EMPTY };
  Object.keys(result).forEach(key => {
    const value = row[key as keyof InventoryFilament];
    if (typeof result[key] === "boolean") result[key] = Boolean(value);
    else result[key] = value == null ? "" : String(value);
  });
  return result;
}

export default function InventoryPanel({ inventory, loading, onReload, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(inventory[0]?.dbId ?? null);
  const selected = inventory.find(row => row.dbId === selectedId);
  const [form, setForm] = useState<FormState>(() => formFrom(selected));
  const [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  const calibrated = useMemo(() => inventory.filter(row => row.calibrated).length, [inventory]);
  const remaining = useMemo(() => inventory.reduce((sum, row) => sum + (row.remainingG ?? 0), 0), [inventory]);

  function choose(row?: InventoryFilament) { setSelectedId(row?.dbId ?? null); setForm(formFrom(row)); setMessage(""); }
  function set(key: string, value: string | boolean) { setForm(current => ({ ...current, [key]: value })); }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/filaments", { method: selectedId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, id: selectedId }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Enregistrement impossible.");
      await onReload(); setMessage("Bobine enregistrée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erreur inattendue."); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!selectedId) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/filaments?id=${selectedId}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Suppression impossible.");
      await onReload(); choose(undefined); setMessage("Bobine supprimée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erreur inattendue."); }
    finally { setSaving(false); }
  }

  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="inventory-drawer" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
    <div className="drawer-head"><div><span className="eyebrow">COMPTE PERSONNEL</span><h2>Inventaire de filaments</h2></div><button className="icon-button" onClick={onClose}>×</button></div>
    <div className="inventory-summary"><div><b>{inventory.length}</b><span>bobines</span></div><div><b>{calibrated}</b><span>calibrées</span></div><div><b>{remaining ? `${Math.round(remaining)} g` : "—"}</b><span>quantité connue</span></div></div>
    <div className="inventory-layout"><div className="inventory-sidebar"><button className="new-spool" onClick={() => choose(undefined)}>＋ Ajouter une bobine</button>{loading && <p>Chargement…</p>}{inventory.map(row => <button key={row.id} className={selectedId === row.dbId ? "active" : ""} onClick={() => choose(row)}><i style={{ background: row.colorHex ?? "#bac0ba" }}></i><span><b>{row.brand} {row.productLine}</b><small>{row.colorName} · {row.family}</small></span><em>{row.remainingG == null ? "? g" : `${Math.round(row.remainingG)} g`}</em></button>)}</div>
      <form className="spool-form" onSubmit={submit}><div className="form-heading"><div><span className="eyebrow">{selectedId ? "MODIFIER" : "NOUVELLE BOBINE"}</span><h3>{selected?.label ?? "Créer une fiche complète"}</h3></div>{selectedId && <button type="button" className="danger-link" onClick={remove}>Supprimer</button>}</div>
        <div className="field-grid"><Field label="Marque *" value={String(form.brand)} onChange={v => set("brand", v)}/><Field label="Gamme *" value={String(form.productLine)} onChange={v => set("productLine", v)}/><SelectField label="Matière *" value={String(form.material)} onChange={v => set("material", v)} options={["PLA","PLA Matte","PETG","PLA Wood","TPU","ABS","ASA","Autre"]}/><Field label="Couleur *" value={String(form.colorName)} onChange={v => set("colorName", v)}/><Field label="Code couleur" type="color" value={String(form.colorHex)} onChange={v => set("colorHex", v)}/><Field label="N° de lot" value={String(form.lotNumber)} onChange={v => set("lotNumber", v)}/><Field label="Poids initial (g)" type="number" value={String(form.spoolWeightG)} onChange={v => set("spoolWeightG", v)}/><Field label="Quantité restante (g)" type="number" value={String(form.remainingG)} onChange={v => set("remainingG", v)}/><Field label="Date d’ouverture" type="date" value={String(form.openedAt)} onChange={v => set("openedAt", v)}/><Field label="Lieu de stockage" value={String(form.storageLocation)} onChange={v => set("storageLocation", v)}/><Field label="Humidité stockage (%)" type="number" value={String(form.storageHumidity)} onChange={v => set("storageHumidity", v)}/><Field label="Profil Creality Print" value={String(form.profileName)} onChange={v => set("profileName", v)}/></div>
        <details open><summary>Paramètres techniques et calibration</summary><div className="field-grid"><Field label="Buse min. (°C)" type="number" value={String(form.nozzleTempMin)} onChange={v => set("nozzleTempMin", v)}/><Field label="Buse max. (°C)" type="number" value={String(form.nozzleTempMax)} onChange={v => set("nozzleTempMax", v)}/><Field label="Plateau min. (°C)" type="number" value={String(form.bedTempMin)} onChange={v => set("bedTempMin", v)}/><Field label="Plateau max. (°C)" type="number" value={String(form.bedTempMax)} onChange={v => set("bedTempMax", v)}/><Field label="Débit volumique max. (mm³/s)" type="number" value={String(form.maxVolumetricSpeed)} onChange={v => set("maxVolumetricSpeed", v)}/><Field label="Ratio de débit" type="number" step="0.001" value={String(form.flowRatio)} onChange={v => set("flowRatio", v)}/><Field label="Pressure advance" type="number" step="0.001" value={String(form.pressureAdvance)} onChange={v => set("pressureAdvance", v)}/><Field label="Séchage (°C)" type="number" value={String(form.dryingTemp)} onChange={v => set("dryingTemp", v)}/><Field label="Séchage (heures)" type="number" step="0.5" value={String(form.dryingHours)} onChange={v => set("dryingHours", v)}/></div><div className="check-grid"><Check label="Compatible CFS" checked={Boolean(form.cfsCompatible)} onChange={v => set("cfsCompatible", v)}/><Check label="Filament abrasif" checked={Boolean(form.abrasive)} onChange={v => set("abrasive", v)}/><Check label="Profil calibré" checked={Boolean(form.calibrated)} onChange={v => set("calibrated", v)}/></div></details>
        <label className="text-field"><span>Notes</span><textarea value={String(form.notes)} onChange={event => set("notes", event.target.value)} rows={3}/></label>{message && <p className="form-message">{message}</p>}<button className="primary full" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer la bobine"}</button>
      </form></div>
  </aside></div>;
}

function Field({ label, value, onChange, type = "text", step }: { label: string; value: string; onChange: (value: string) => void; type?: string; step?: string }) { return <label className="text-field"><span>{label}</span><input type={type} step={step} value={value} onChange={event => onChange(event.target.value)} /></label>; }
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label className="text-field"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="check-field"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><span>{label}</span></label>; }
