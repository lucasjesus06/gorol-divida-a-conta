-- Copia o rolê para quem pagou e para a divisão de cada despesa, preenchendo o histórico sem mudar valores.
-- Os gatilhos que protegem o histórico são desligados só durante o preenchimento, dentro desta mesma
-- transação: se qualquer conferência falhar, tudo é desfeito e os gatilhos continuam ligados.
ALTER TABLE "expense_payers" ADD COLUMN "outing_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD COLUMN "outing_id" uuid;--> statement-breakpoint
DO $$
declare
  payers_count bigint; payers_sum numeric; shares_count bigint; shares_sum numeric;
  payers_count_after bigint; payers_sum_after numeric; shares_count_after bigint; shares_sum_after numeric;
begin
  select count(*), coalesce(sum(amount_cents), 0) into payers_count, payers_sum from expense_payers;
  select count(*), coalesce(sum(amount_cents), 0) into shares_count, shares_sum from expense_shares;

  alter table expense_payers disable trigger expense_payers_forbid_change;
  alter table expense_shares disable trigger expense_shares_forbid_change;
  update expense_payers p set outing_id = e.outing_id from expenses e where e.id = p.expense_id;
  update expense_shares s set outing_id = e.outing_id from expenses e where e.id = s.expense_id;
  alter table expense_payers enable trigger expense_payers_forbid_change;
  alter table expense_shares enable trigger expense_shares_forbid_change;

  select count(*), coalesce(sum(amount_cents), 0) into payers_count_after, payers_sum_after from expense_payers;
  select count(*), coalesce(sum(amount_cents), 0) into shares_count_after, shares_sum_after from expense_shares;
  if payers_count <> payers_count_after or payers_sum <> payers_sum_after or shares_count <> shares_count_after or shares_sum <> shares_sum_after then
    raise exception 'preenchimento alterou valores ou linhas do historico financeiro';
  end if;
  if exists (select 1 from expense_payers where outing_id is null) or exists (select 1 from expense_shares where outing_id is null) then
    raise exception 'ha partes de despesa sem rolê depois do preenchimento';
  end if;
  if exists (select 1 from expense_payers p join expenses e on e.id = p.expense_id where p.outing_id <> e.outing_id)
    or exists (select 1 from expense_shares s join expenses e on e.id = s.expense_id where s.outing_id <> e.outing_id) then
    raise exception 'rolê copiado diferente do rolê da despesa';
  end if;
end
$$;--> statement-breakpoint
ALTER TABLE "expense_payers" ALTER COLUMN "outing_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_shares" ALTER COLUMN "outing_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_payers_outing_idx" ON "expense_payers" USING btree ("outing_id");--> statement-breakpoint
CREATE INDEX "expense_shares_outing_idx" ON "expense_shares" USING btree ("outing_id");--> statement-breakpoint
create function app.copy_expense_outing() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select e.outing_id into new.outing_id from expenses e where e.id = new.expense_id;
  if new.outing_id is null then
    raise exception 'expense_not_found' using errcode = '23503';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger expense_payers_copy_outing before insert on expense_payers for each row execute function app.copy_expense_outing();--> statement-breakpoint
create trigger expense_shares_copy_outing before insert on expense_shares for each row execute function app.copy_expense_outing();
