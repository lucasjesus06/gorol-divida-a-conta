import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  description,
  backHref,
  actions,
}: {
  title: string;
  description?: string;
  backHref?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {backHref && (
          <Button asChild variant="ghost" size="icon" aria-label="Voltar" title="Voltar" className="-ml-2 shrink-0">
            <Link href={backHref}>
              <ArrowLeft />
            </Link>
          </Button>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions}
    </header>
  );
}
