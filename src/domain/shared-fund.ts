/** Two people who share the same money from `acceptedAt` on, until `endedAt` if they stop. */
export type SharedFund = {
  id: string;
  personA: string;
  personB: string;
  acceptedAt: Date;
  endedAt: Date | null;
};

export function isFundLiveAt(fund: SharedFund, at: Date): boolean {
  return fund.acceptedAt.getTime() <= at.getTime() && (fund.endedAt === null || at.getTime() < fund.endedAt.getTime());
}

/** True when nothing is owed between the two people for what happened at `at`: they share the same money then. */
export function areNeutralAt(funds: SharedFund[], x: string, y: string, at: Date): boolean {
  return funds.some((fund) => isFundLiveAt(fund, at) && ((fund.personA === x && fund.personB === y) || (fund.personA === y && fund.personB === x)));
}

/** The pairs that share the same money right now. */
export function liveFundPairs(funds: SharedFund[], now: Date): [string, string][] {
  return funds.filter((fund) => isFundLiveAt(fund, now)).map((fund) => [fund.personA, fund.personB]);
}
