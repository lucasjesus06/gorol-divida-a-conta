import type { Bill, Claim, Guest } from "../model/types";

export const claimQty = (c?: Claim) => (c ? c.units + (c.splitOf ? 1 / c.splitOf : 0) : 0);

export function guestTotals(bill: Bill, guest: Guest) {
  let subtotal = 0;
  const lines = bill.items
    .map((item) => {
      const q = claimQty(guest.claims[item.id]);
      const amount = q * item.unitPrice;
      subtotal += amount;
      return { item, qty: q, amount, fee: amount * bill.serviceRate };
    })
    .filter((l) => l.qty > 0);
  const fee = subtotal * bill.serviceRate;
  return { lines, subtotal, fee, total: subtotal + fee };
}

export function billTotals(bill: Bill) {
  const subtotal = bill.items.reduce((a, i) => a + i.unitPrice * i.qty, 0);
  const fee = subtotal * bill.serviceRate;
  const claimed = bill.guests.reduce((a, g) => a + guestTotals(bill, g).total, 0);
  const paid = bill.guests
    .filter((g) => g.paid)
    .reduce((a, g) => a + guestTotals(bill, g).total, 0);
  return { subtotal, fee, total: subtotal + fee, claimed, paid };
}

export function itemClaimedQty(bill: Bill, itemId: string, exceptGuestId?: string) {
  return bill.guests.reduce(
    (a, g) => (g.id === exceptGuestId ? a : a + claimQty(g.claims[itemId])),
    0,
  );
}
