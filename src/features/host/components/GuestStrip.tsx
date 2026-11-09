import { Check, Users } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { brl } from "@/lib/format";
import { guestTotals, type Bill } from "@/features/bill";

export function GuestStrip({ bill }: { bill: Bill }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Users className="h-4 w-4" /> Na mesa ({bill.guests.length})
        </h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
        {bill.guests.map((g) => {
          const t = guestTotals(bill, g);
          return (
            <div
              key={g.id}
              className="card-surface flex min-w-[124px] flex-col items-center gap-2 p-3.5 text-center"
            >
              <div className="relative">
                <Avatar name={g.name} />
                {g.paid && (
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-success text-success-foreground ring-2 ring-card">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="text-sm font-bold">{g.name}</p>
              <p
                className={`text-xs font-semibold ${g.paid ? "text-success" : "text-muted-foreground"}`}
              >
                {g.paid ? "Pagou" : t.total ? brl(t.total) : "Escolhendo…"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
