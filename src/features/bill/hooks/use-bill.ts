import { useSyncExternalStore } from "react";
import type { BillState } from "../model/types";
import { emptyState, getState, subscribe } from "../services/bill-store";

function useBillState<T>(selector: (s: BillState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(emptyState),
  );
}

export function useBill(slug: string) {
  return useBillState((s) => s.roles[slug]);
}

export function useCurrentGuestId(slug: string) {
  return useBillState((s) => s.currentGuest[slug]);
}
