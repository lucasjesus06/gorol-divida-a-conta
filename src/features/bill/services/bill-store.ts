import type { BillState } from "../model/types";

const STORAGE_KEY = "gorole:v1";

export const emptyState: BillState = { roles: {}, currentGuest: {} };

let state: BillState = emptyState;
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

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw) as BillState;
  } catch {
    state = emptyState;
  }
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      state = JSON.parse(e.newValue) as BillState;
      listeners.forEach((l) => l());
    }
  });
}

export function getState(): BillState {
  return state;
}

export function setState(updater: (s: BillState) => BillState) {
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
