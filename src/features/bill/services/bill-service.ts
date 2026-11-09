import { MOCK_ITEMS } from "../model/mock-data";
import type { Bill, Claim, Guest } from "../model/types";
import { setState } from "./bill-store";

const uid = () => Math.random().toString(36).slice(2, 9);

export function createBill(): Bill {
  const slug = "mesa-da-resenha";
  const ownerId = uid();
  const bill: Bill = {
    slug,
    title: "Mesa da Resenha",
    venue: "Boteco do Zé — Vila Madalena",
    nfeKey: "3526 0912 3456 7800 0195 6500 1000 0012 3410 0012 3456",
    serviceRate: 0.1,
    items: MOCK_ITEMS,
    ownerId,
    createdAt: Date.now(),
    guests: [
      {
        id: ownerId,
        name: "Lucas",
        claims: { i1: { units: 2, splitOf: null }, i2: { units: 0, splitOf: 3 } },
        paid: false,
      },
      {
        id: uid(),
        name: "Maria",
        claims: {
          i4: { units: 1, splitOf: null },
          i2: { units: 0, splitOf: 3 },
          i3: { units: 0, splitOf: 2 },
        },
        paid: true,
        paidAmount: 68.75,
        paidBy: "MARIA EDUARDA ALVES",
      },
      {
        id: uid(),
        name: "João",
        claims: { i1: { units: 3, splitOf: null }, i7: { units: 1, splitOf: null } },
        paid: false,
      },
    ],
  };
  setState((s) => ({
    ...s,
    roles: { ...s.roles, [slug]: bill },
    currentGuest: { ...s.currentGuest, [slug]: ownerId },
  }));
  return bill;
}

export function joinBill(slug: string, name: string): Guest {
  const guest: Guest = { id: uid(), name: name.trim(), claims: {}, paid: false };
  setState((s) => {
    const bill = s.roles[slug];
    if (!bill) return s;
    return {
      ...s,
      roles: { ...s.roles, [slug]: { ...bill, guests: [...bill.guests, guest] } },
      currentGuest: { ...s.currentGuest, [slug]: guest.id },
    };
  });
  return guest;
}

export function leaveBill(slug: string) {
  setState((s) => {
    const cg = { ...s.currentGuest };
    delete cg[slug];
    return { ...s, currentGuest: cg };
  });
}

export function setClaim(slug: string, guestId: string, itemId: string, claim: Claim) {
  setState((s) => {
    const bill = s.roles[slug];
    if (!bill) return s;
    return {
      ...s,
      roles: {
        ...s.roles,
        [slug]: {
          ...bill,
          guests: bill.guests.map((g) => {
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
    const bill = s.roles[slug];
    if (!bill) return s;
    return {
      ...s,
      roles: {
        ...s.roles,
        [slug]: {
          ...bill,
          guests: bill.guests.map((g) =>
            g.id === guestId ? { ...g, paid: true, paidAmount: amount, paidBy } : g,
          ),
        },
      },
    };
  });
}
