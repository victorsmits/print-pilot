"use client";

import type { AccountUser } from "./PrintPilotClient";

export default function AccountPanel({ user, inventoryCount, onClose }: { user: AccountUser; inventoryCount: number; onClose: () => void }) {
  const name = user?.displayName ?? "Compte non connecté";
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="account-drawer" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true"><div className="drawer-head"><div><span className="eyebrow">MON COMPTE</span><h2>Profil PrintPilot</h2></div><button className="icon-button" onClick={onClose}>×</button></div><div className="account-identity"><span>{name.charAt(0).toUpperCase()}</span><div><b>{name}</b><small>{user?.email ?? "Connecte-toi pour retrouver tes données."}</small></div></div><div className="account-stats"><div><b>{inventoryCount}</b><span>bobines enregistrées</span></div><div><b>Creality Hi</b><span>imprimante principale</span></div><div><b>0,4 mm</b><span>buse par défaut</span></div></div><div className="account-note"><b>Données personnelles</b><p>L’inventaire et l’historique sont isolés par adresse Google. Google ne reçoit aucun STL ni réglage d’impression.</p></div>{user ? <a className="secondary full account-link" href="/auth/logout">Se déconnecter</a> : <a className="primary full account-link" href="/auth/google?return_to=%2F">Se connecter avec Google</a>}</aside></div>;
}
