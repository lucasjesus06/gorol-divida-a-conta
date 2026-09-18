import { useSyncExternalStore } from "react";

export type Item = {
  id: string;
  name: string;
  unitPrice: number;
  qty: number;
  emoji: string;
};

export type Claim = {
  units: number; // whole units claimed
  splitOf: number | null; // share one unit among N people (adds 1/N)
};

export type Guest = {
  id: string;
  name: string;
  claims: Record<string, Claim>;
  paid: boolean;
  paidAmount?: number;
  paidBy?: string; // full name from bank payload
};

export type Rolê = {
  slug: string;
  title: string;
  venue: string;
  nfeKey: string;
  serviceRate: number; // 0.10 or 0.13
  items: Item[];
  guests: Guest[];
  ownerId: string;
  createdAt: number;
};

type State = {
  roles: Record<string, Rolê>;
  currentGuest: Record<string, string>; // slug -> guestId (this device)
};

const STORAGE_KEY = "gorole:v1";

const emptyState: State = { roles: {}, currentGuest: {} };

let state: State = emptyState;
let hydrated = false;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function setState(updater: (s: State) => State) {
  state = updater(state);
  emit();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw) as State;
  } catch {
    state = emptyState;
  }
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      state = JSON.parse(e.newValue) as State;
      listeners.forEach((l) => l());
    }
  });
}

function subscribe(l: () => void) {
  hydrate();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRoleStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(emptyState),
  );
}

/* ---------- Mock data ---------- */

export const MOCK_ITEMS: Item[] = [
  { id: "i1", name: "Chopp Brahma 300ml", unitPrice: 12, qty: 8, emoji: "🍺" },
  { id: "i2", name: "Picanha na Chapa", unitPrice: 89, qty: 1, emoji: "🥩" },
  { id: "i3", name: "Porção de Batata Rústica", unitPrice: 38, qty: 1, emoji: "🍟" },
  { id: "i4", name: "Caipirinha de Limão", unitPrice: 22, qty: 3, emoji: "🍹" },
  { id: "i5", name: "Água Sem Gás 500ml", unitPrice: 6, qty: 2, emoji: "💧" },
  { id: "i6", name: "Refrigerante Lata", unitPrice: 8, qty: 2, emoji: "🥤" },
  { id: "i7", name: "Pastel de Queijo (6un)", unitPrice: 32, qty: 1, emoji: "🥟" },
];

const uid = () => Math.random().toString(36).slice(2, 9);

export function createRole(): Rolê {
  const slug = "mesa-da-resenha";
  const ownerId = uid();
  const role: Rolê = {
    slug,
    title: "Mesa da Resenha",
    venue: "Boteco do Zé — Vila Madalena",
    nfeKey: "3526 0912 3456 7800 0195 6500 1000 0012 3410 0012 3456",
    serviceRate: 0.1,
    items: MOCK_ITEMS,
    ownerId,
    createdAt: Date.now(),
    guests: [
      { id: ownerId, name: "Lucas", claims: { i1: { units: 2, splitOf: null }, i2: { units: 0, splitOf: 3 } }, paid: false },
      { id: uid(), name: "Maria", claims: { i4: { units: 1, splitOf: null }, i2: { units: 0, splitOf: 3 }, i3: { units: 0, splitOf: 2 } }, paid: true, paidAmount: 68.75, paidBy: "MARIA EDUARDA ALVES" },
      { id: uid(), name: "João", claims: { i1: { units: 3, splitOf: null }, i7: { units: 1, splitOf: null } }, paid: false },
    ],
  };
  setState((s) => ({
    ...s,
    roles: { ...s.roles, [slug]: role },
    currentGuest: { ...s.currentGuest, [slug]: ownerId },
  }));
  return role;
}

export function joinRole(slug: string, name: string): Guest {
  const guest: Guest = { id: uid(), name: name.trim(), claims: {}, paid: false };
  setState((s) => {
    const role = s.roles[slug];
    if (!role) return s;
    return {
      ...s,
      roles: { ...s.roles, [slug]: { ...role, guests: [...role.guests, guest] } },
      currentGuest: { ...s.currentGuest, [slug]: guest.id },
    };
  });
  return guest;
}

export function leaveRole(slug: string) {
  setState((s) => {
    const cg = { ...s.currentGuest };
    delete cg[slug];
    return { ...s, currentGuest: cg };
  });
}

export function setClaim(slug: string, guestId: string, itemId: string, claim: Claim) {
  setState((s) => {
    const role = s.roles[slug];
    if (!role) return s;
    return {
      ...s,
      roles: {
        ...s.roles,
        [slug]: {
          ...role,
          guests: role.guests.map((g) => {
            if (g.id !== guestId) return g;
            const claims = { ...g.claims };
            if (claim.units <= 0 && !claim.splitOf) delete claims[itemId];
            else claims[itemId] = claim;
            return { ...g, claims };
          }),
        },
      },
    };
  });
}

export function markPaid(slug: string, guestId: string, amount: number, paidBy: string) {
  setState((s) => {
    const role = s.roles[slug];
    if (!role) return s;
    return {
      ...s,
      roles: {
        ...s.roles,
        [slug]: {
          ...role,
          guests: role.guests.map((g) =>
            g.id === guestId ? { ...g, paid: true, paidAmount: amount, paidBy } : g,
          ),
        },
      },
    };
  });
}

/* ---------- Calculations ---------- */

export const claimQty = (c?: Claim) => (c ? c.units + (c.splitOf ? 1 / c.splitOf : 0) : 0);

export function guestTotals(role: Rolê, guest: Guest) {
  let subtotal = 0;
  const lines = role.items
    .map((item) => {
      const q = claimQty(guest.claims[item.id]);
      const amount = q * item.unitPrice;
      subtotal += amount;
      return { item, qty: q, amount, fee: amount * role.serviceRate };
    })
    .filter((l) => l.qty > 0);
  const fee = subtotal * role.serviceRate;
  return { lines, subtotal, fee, total: subtotal + fee };
}

export function roleTotals(role: Rolê) {
  const subtotal = role.items.reduce((a, i) => a + i.unitPrice * i.qty, 0);
  const fee = subtotal * role.serviceRate;
  const claimed = role.guests.reduce((a, g) => a + guestTotals(role, g).total, 0);
  const paid = role.guests.filter((g) => g.paid).reduce((a, g) => a + guestTotals(role, g).total, 0);
  return { subtotal, fee, total: subtotal + fee, claimed, paid };
}

export function itemClaimedQty(role: Rolê, itemId: string, exceptGuestId?: string) {
  return role.guests.reduce(
    (a, g) => (g.id === exceptGuestId ? a : a + claimQty(g.claims[itemId])),
    0,
  );
}

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ---------- Pix ---------- */

export function buildPixCode(amount: number, txid: string) {
  const val = amount.toFixed(2);
  const merchant = "GOROLE PAGAMENTOS LTDA";
  const gui = "0014br.gov.bcb.pix0136a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const payload =
    `000201010212` +
    `26${String(gui.length).padStart(2, "0")}${gui}` +
    `52040000530398654${String(val.length).padStart(2, "0")}${val}` +
    `5802BR59${String(merchant.length).padStart(2, "0")}${merchant}` +
    `6009SAO PAULO62${String(txid.length + 4).padStart(2, "0")}05${String(txid.length).padStart(2, "0")}${txid}6304`;
  // fake CRC16
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return payload + crc.toString(16).toUpperCase().padStart(4, "0");
}

export const MOCK_PAYER_NAMES = [
  "ANA CAROLINA SOUZA LIMA",
  "PEDRO HENRIQUE MARTINS ROCHA",
  "JULIANA FERREIRA DOS SANTOS",
  "RAFAEL AUGUSTO NOGUEIRA",
];
