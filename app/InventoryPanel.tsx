"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import type { InventoryFilament } from "./PrintPilotClient";
import type { InvoiceDraft } from "./invoiceImport";
import type { InvoiceItemDraft } from "./invoiceParser";

type Props = { inventory: InventoryFilament[]; loading: boolean; onReload: () => Promise<void>; onClose: () => void };
type FormState = Record<string, string | boolean>;

const EMPTY: FormState = {
  brand: "", productLine: "", material: "PLA", colorName: "", colorHex: "#35d77d", spoolWeightG: "", remainingG: "", pricePerKg: "", lotNumber: "", supplier: "", purchaseDate: "", invoiceNumber: "", purchaseTotal: "", purchaseQuantity: "1", cfsSlot: "", nozzleDiameter: "0.4", lastDriedAt: "", openedAt: "", storageLocation: "", storageHumidity: "", profileName: "", nozzleTempMin: "", nozzleTempMax: "", bedTempMin: "", bedTempMax: "", maxVolumetricSpeed: "", flowRatio: "", pressureAdvance: "", dryingTemp: "", dryingHours: "", cfsCompatible: true, abrasive: false, calibrated: false, notes: "",
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
  const [invoiceWarnings, setInvoiceWarnings] = useState<string[]>([]), [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const calibrated = useMemo(() => inventory.filter(row => row.calibrated).length, [inventory]);
  const remaining = useMemo(() => inventory.reduce((sum, row) => sum + (row.remainingG ?? 0), 0), [inventory]);

  function choose(row?: InventoryFilament) { setSelectedId(row?.dbId ?? null); setForm(formFrom(row)); setMessage(""); }
  function set(key: string, value: string | boolean) { setForm(current => ({ ...current, [key]: value })); }

  async function importInvoice(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setInvoiceLoading(true); setMessage(""); setInvoiceWarnings([]);
    try {
      const { readInvoicePdf } = await import("./invoiceImport");
      const draft = await readInvoicePdf(file);
      setInvoiceDraft({ ...draft, items: draft.items.length ? draft.items : [newInvoiceItem(draft, 0)] });
      setInvoiceWarnings(draft.warnings);
      setMessage("Facture analysée localement. Vérifie chaque ligne avant l’import groupé.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Lecture de facture impossible."); }
    finally { setInvoiceLoading(false); event.target.value = ""; }
  }

  function updateInvoiceMeta(key: keyof Pick<InvoiceDraft, "supplier" | "invoiceNumber" | "purchaseDate" | "purchaseTotal">, value: string) {
    setInvoiceDraft(current => current ? { ...current, [key]: value } : current);
  }

  function updateInvoiceItem(id: string, patch: Partial<InvoiceItemDraft>) {
    setInvoiceDraft(current => current ? { ...current, items: current.items.map(item => item.id === id ? { ...item, ...patch } : item) } : current);
  }

  function addInvoiceItem() {
    setInvoiceDraft(current => current ? { ...current, items: [...current.items, newInvoiceItem(current, current.items.length)] } : current);
  }

  async function saveInvoiceBatch() {
    if (!invoiceDraft) return;
    const selectedItems = invoiceDraft.items.filter(item => item.selected);
    const invalid = selectedItems.find(item => !item.brand.trim() || !item.productLine.trim() || !item.material.trim() || !item.colorName.trim() || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1);
    const count = selectedItems.reduce((sum, item) => sum + Number(item.quantity), 0);
    if (!selectedItems.length) { setMessage("Sélectionne au moins une ligne de facture."); return; }
    if (invalid) { setMessage("Complète marque, gamme, matière, couleur et quantité pour chaque ligne sélectionnée."); return; }
    if (count > 100) { setMessage("L’import est limité à 100 bobines par facture."); return; }
    setSaving(true); setMessage(""); let created = 0;
    try {
      for (const item of selectedItems) {
        for (let copy = 0; copy < Number(item.quantity); copy++) {
          const response = await fetch("/api/filaments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
            brand: item.brand, productLine: item.productLine, material: item.material, colorName: item.colorName,
            spoolWeightG: item.spoolWeightG, remainingG: item.spoolWeightG, pricePerKg: item.pricePerKg,
            supplier: invoiceDraft.supplier, invoiceNumber: invoiceDraft.invoiceNumber, purchaseDate: invoiceDraft.purchaseDate,
            purchaseTotal: invoiceDraft.purchaseTotal, purchaseQuantity: item.quantity,
          }) });
          const payload = await response.json() as { error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Import impossible.");
          created++;
        }
      }
      await onReload(); setInvoiceDraft(null); setInvoiceWarnings([]); setMessage(`${created} bobine${created > 1 ? "s" : ""} ajoutée${created > 1 ? "s" : ""}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Erreur inattendue.";
      setMessage(created ? `${created} bobine(s) créée(s), puis l’import s’est interrompu : ${detail}` : detail);
      if (created) await onReload();
    } finally { setSaving(false); }
  }

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
        <section className="invoice-import"><input ref={invoiceRef} type="file" accept=".pdf,application/pdf" hidden onChange={importInvoice}/><div><b>Importer une facture PDF</b><span>Extraction locale de toutes les lignes détectées. Le PDF n’est ni envoyé ni conservé.</span></div><button type="button" className="secondary" disabled={invoiceLoading} onClick={() => invoiceRef.current?.click()}>{invoiceLoading ? "Lecture…" : "Choisir un PDF"}</button>{invoiceWarnings.length > 0 && <ul>{invoiceWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}</section>
        {invoiceDraft && <InvoiceBatch draft={invoiceDraft} saving={saving} onMeta={updateInvoiceMeta} onItem={updateInvoiceItem} onAdd={addInvoiceItem} onRemove={id => setInvoiceDraft(current => current ? { ...current, items: current.items.filter(item => item.id !== id) } : current)} onCancel={() => setInvoiceDraft(null)} onSave={saveInvoiceBatch}/>}
        <div className="field-grid"><Field label="Marque *" value={String(form.brand)} onChange={v => set("brand", v)}/><Field label="Gamme *" value={String(form.productLine)} onChange={v => set("productLine", v)}/><SelectField label="Matière *" value={String(form.material)} onChange={v => set("material", v)} options={["PLA","PLA Matte","PETG","PLA Wood","TPU","ABS","ASA","Autre"]}/><Field label="Couleur *" value={String(form.colorName)} onChange={v => set("colorName", v)}/><Field label="Code couleur" type="color" value={String(form.colorHex)} onChange={v => set("colorHex", v)}/><Field label="N° de lot" value={String(form.lotNumber)} onChange={v => set("lotNumber", v)}/><Field label="Poids initial (g)" type="number" value={String(form.spoolWeightG)} onChange={v => set("spoolWeightG", v)}/><Field label="Quantité restante (g)" type="number" value={String(form.remainingG)} onChange={v => set("remainingG", v)}/><Field label="Prix du filament (€/kg)" type="number" step="0.01" value={String(form.pricePerKg)} onChange={v => set("pricePerKg", v)}/><Field label="Date d’ouverture" type="date" value={String(form.openedAt)} onChange={v => set("openedAt", v)}/><Field label="Lieu de stockage" value={String(form.storageLocation)} onChange={v => set("storageLocation", v)}/><Field label="Humidité stockage (%)" type="number" value={String(form.storageHumidity)} onChange={v => set("storageHumidity", v)}/><Field label="Profil Creality Print" value={String(form.profileName)} onChange={v => set("profileName", v)}/></div>
        <details open><summary>Achat, facture et rangement</summary><div className="field-grid"><Field label="Fournisseur" value={String(form.supplier)} onChange={v => set("supplier", v)}/><Field label="N° de facture" value={String(form.invoiceNumber)} onChange={v => set("invoiceNumber", v)}/><Field label="Date d’achat" type="date" value={String(form.purchaseDate)} onChange={v => set("purchaseDate", v)}/><Field label="Total facture (€)" type="number" step="0.01" value={String(form.purchaseTotal)} onChange={v => set("purchaseTotal", v)}/><Field label="Bobines achetées" type="number" value={String(form.purchaseQuantity)} onChange={v => set("purchaseQuantity", v)}/><Field label="Emplacement CFS" value={String(form.cfsSlot)} onChange={v => set("cfsSlot", v)}/><Field label="Buse conseillée (mm)" type="number" step="0.1" value={String(form.nozzleDiameter)} onChange={v => set("nozzleDiameter", v)}/><Field label="Dernier séchage" type="date" value={String(form.lastDriedAt)} onChange={v => set("lastDriedAt", v)}/></div></details>
        <details open><summary>Paramètres techniques et calibration</summary><div className="field-grid"><Field label="Buse min. (°C)" type="number" value={String(form.nozzleTempMin)} onChange={v => set("nozzleTempMin", v)}/><Field label="Buse max. (°C)" type="number" value={String(form.nozzleTempMax)} onChange={v => set("nozzleTempMax", v)}/><Field label="Plateau min. (°C)" type="number" value={String(form.bedTempMin)} onChange={v => set("bedTempMin", v)}/><Field label="Plateau max. (°C)" type="number" value={String(form.bedTempMax)} onChange={v => set("bedTempMax", v)}/><Field label="Débit volumique max. (mm³/s)" type="number" value={String(form.maxVolumetricSpeed)} onChange={v => set("maxVolumetricSpeed", v)}/><Field label="Ratio de débit" type="number" step="0.001" value={String(form.flowRatio)} onChange={v => set("flowRatio", v)}/><Field label="Pressure advance" type="number" step="0.001" value={String(form.pressureAdvance)} onChange={v => set("pressureAdvance", v)}/><Field label="Séchage (°C)" type="number" value={String(form.dryingTemp)} onChange={v => set("dryingTemp", v)}/><Field label="Séchage (heures)" type="number" step="0.5" value={String(form.dryingHours)} onChange={v => set("dryingHours", v)}/></div><div className="check-grid"><Check label="Compatible CFS" checked={Boolean(form.cfsCompatible)} onChange={v => set("cfsCompatible", v)}/><Check label="Filament abrasif" checked={Boolean(form.abrasive)} onChange={v => set("abrasive", v)}/><Check label="Profil calibré" checked={Boolean(form.calibrated)} onChange={v => set("calibrated", v)}/></div></details>
        <label className="text-field"><span>Notes</span><textarea value={String(form.notes)} onChange={event => set("notes", event.target.value)} rows={3}/></label>{message && <p className="form-message">{message}</p>}<button className="primary full" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer la bobine"}</button>
      </form></div>
  </aside></div>;
}

function newInvoiceItem(draft: Pick<InvoiceDraft, "brand" | "productLine" | "material" | "colorName" | "spoolWeightG" | "pricePerKg">, index: number): InvoiceItemDraft {
  return { id: `manual-${Date.now()}-${index}`, selected: true, quantity: "1", brand: draft.brand, productLine: draft.productLine, material: draft.material, colorName: draft.colorName, spoolWeightG: draft.spoolWeightG, unitPrice: "", pricePerKg: draft.pricePerKg, sourceLine: "Ajout manuel" };
}

function InvoiceBatch({ draft, saving, onMeta, onItem, onAdd, onRemove, onCancel, onSave }: { draft: InvoiceDraft; saving: boolean; onMeta: (key: keyof Pick<InvoiceDraft, "supplier" | "invoiceNumber" | "purchaseDate" | "purchaseTotal">, value: string) => void; onItem: (id: string, patch: Partial<InvoiceItemDraft>) => void; onAdd: () => void; onRemove: (id: string) => void; onCancel: () => void; onSave: () => Promise<void> }) {
  const total = draft.items.filter(item => item.selected).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
  return <section className="invoice-batch"><div className="invoice-batch-head"><div><span>IMPORT GROUPÉ</span><h3>{draft.items.length} ligne(s) détectée(s) · {total} bobine(s)</h3></div><button type="button" className="danger-link" onClick={onCancel}>Annuler l’import</button></div><div className="invoice-meta"><Field label="Fournisseur" value={draft.supplier} onChange={value => onMeta("supplier", value)}/><Field label="N° de facture" value={draft.invoiceNumber} onChange={value => onMeta("invoiceNumber", value)}/><Field label="Date" type="date" value={draft.purchaseDate} onChange={value => onMeta("purchaseDate", value)}/><Field label="Total facture (€)" type="number" step="0.01" value={draft.purchaseTotal} onChange={value => onMeta("purchaseTotal", value)}/></div><div className="invoice-items">{draft.items.map((item, index) => <article key={item.id} className={item.selected ? "selected" : ""}><header><label><input type="checkbox" checked={item.selected} onChange={event => onItem(item.id, { selected: event.target.checked })}/><b>Ligne {index + 1}</b></label><button type="button" className="danger-link" onClick={() => onRemove(item.id)}>Supprimer</button></header><small title={item.sourceLine}>{item.sourceLine}</small><div><Field label="Quantité *" type="number" value={item.quantity} onChange={value => onItem(item.id, { quantity: value })}/><Field label="Marque *" value={item.brand} onChange={value => onItem(item.id, { brand: value })}/><Field label="Gamme / produit *" value={item.productLine} onChange={value => onItem(item.id, { productLine: value })}/><SelectField label="Matière *" value={item.material} onChange={value => onItem(item.id, { material: value })} options={["PLA","PLA Matte","PETG","PLA Wood","TPU","ABS","ASA","Autre"]}/><Field label="Couleur *" value={item.colorName} onChange={value => onItem(item.id, { colorName: value })}/><Field label="Poids/bobine (g)" type="number" value={item.spoolWeightG} onChange={value => onItem(item.id, { spoolWeightG: value })}/><Field label="Prix unitaire (€)" type="number" step="0.01" value={item.unitPrice} onChange={value => { const kg = Number(item.spoolWeightG) / 1000; onItem(item.id, { unitPrice: value, pricePerKg: kg > 0 && Number(value) > 0 ? (Number(value) / kg).toFixed(2) : item.pricePerKg }); }}/><Field label="Prix (€/kg)" type="number" step="0.01" value={item.pricePerKg} onChange={value => onItem(item.id, { pricePerKg: value })}/></div></article>)}</div><div className="invoice-batch-actions"><button type="button" className="secondary" onClick={onAdd}>＋ Ajouter une ligne</button><button type="button" className="primary" disabled={saving || total < 1} onClick={() => void onSave()}>{saving ? "Import en cours…" : `Ajouter ${total} bobine${total > 1 ? "s" : ""}`}</button></div></section>;
}

function Field({ label, value, onChange, type = "text", step }: { label: string; value: string; onChange: (value: string) => void; type?: string; step?: string }) { return <label className="text-field"><span>{label}</span><input type={type} step={step} value={value} onChange={event => onChange(event.target.value)} /></label>; }
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label className="text-field"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="check-field"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><span>{label}</span></label>; }
