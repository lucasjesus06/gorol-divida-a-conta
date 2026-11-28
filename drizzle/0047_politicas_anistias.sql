revoke update, delete on amnesties from authenticated;--> statement-breakpoint
revoke update, delete on amnesty_items from authenticated;--> statement-breakpoint
create policy amnesties_select on amnesties for select to authenticated using (creditor_id = app.person_id() or debtor_id = app.person_id());--> statement-breakpoint
create policy amnesties_insert on amnesties for insert to authenticated with check (creditor_id = app.person_id());--> statement-breakpoint
create policy amnesty_items_select on amnesty_items for select to authenticated using (
  exists (select 1 from amnesties a where a.id = amnesty_id and (a.creditor_id = app.person_id() or a.debtor_id = app.person_id()))
);--> statement-breakpoint
create policy amnesty_items_insert on amnesty_items for insert to authenticated with check (
  exists (select 1 from amnesties a where a.id = amnesty_id and a.creditor_id = app.person_id() and a.created_at = now())
);--> statement-breakpoint
create function app.assert_amnesty_item() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  header amnesties%rowtype;
  expense_total bigint;
begin
  select * into header from amnesties where id = new.amnesty_id;
  select e.total_cents into expense_total from expenses e where e.id = new.expense_id and e.outing_id = new.outing_id;
  if expense_total is null then
    raise exception 'amnesty_expense_not_in_outing' using errcode = '23514';
  end if;
  if new.amount_cents > expense_total then
    raise exception 'amnesty_item_above_expense' using errcode = '23514';
  end if;
  if exists (
    select 1
    from (select header.creditor_id as person_id union select header.debtor_id) involved
    where not exists (
      select 1 from outing_participants op
      where op.outing_id = new.outing_id and op.person_id = involved.person_id and op.confirmed_at is not null
    )
  ) then
    raise exception 'amnesty_person_not_in_outing' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger amnesty_items_check before insert on amnesty_items for each row execute function app.assert_amnesty_item();--> statement-breakpoint
create function app.assert_amnesty_total() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  items_total bigint;
begin
  select coalesce(sum(amount_cents), 0) into items_total from amnesty_items where amnesty_id = new.id;
  if items_total <> new.total_cents then
    raise exception 'amnesty_total_mismatch' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create constraint trigger amnesties_total_matches after insert on amnesties deferrable initially deferred for each row execute function app.assert_amnesty_total();--> statement-breakpoint
create trigger amnesties_forbid_change before update or delete on amnesties for each row execute function app.forbid_change();--> statement-breakpoint
create trigger amnesty_items_forbid_change before update or delete on amnesty_items for each row execute function app.forbid_change();
