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

export type Bill = {
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

// Persisted shape in localStorage; field names are kept stable so saved data keeps loading.
export type BillState = {
  roles: Record<string, Bill>;
  currentGuest: Record<string, string>; // slug -> guestId (this device)
};
