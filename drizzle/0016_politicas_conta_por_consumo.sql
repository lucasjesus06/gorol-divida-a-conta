create function app.can_see_bill(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from consumption_bills b where b.id = target and app.is_participant(b.outing_id))
$$;--> statement-breakpoint
create function app.can_see_bill_item(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from bill_items i join consumption_bills b on b.id = i.bill_id where i.id = target and app.is_participant(b.outing_id))
$$;--> statement-breakpoint
create function app.owns_new_bill(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from consumption_bills b where b.id = target and b.opened_by = app.person_id() and b.status = 'open')
$$;--> statement-breakpoint
create function app.can_mark_bill_item(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from bill_items i join consumption_bills b on b.id = i.bill_id where i.id = target and b.status = 'open' and app.is_participant(b.outing_id))
$$;--> statement-breakpoint
create function app.can_edit_claim(item uuid, owner uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from bill_items i join consumption_bills b on b.id = i.bill_id where i.id = item and b.status = 'open' and app.is_participant(b.outing_id) and (owner = app.person_id() or app.is_admin(b.outing_id)))
$$;--> statement-breakpoint
revoke update, delete on consumption_bills, bill_payers, bill_items from authenticated;--> statement-breakpoint
create policy consumption_bills_select on consumption_bills for select to authenticated using (app.is_participant(outing_id));--> statement-breakpoint
create policy consumption_bills_insert on consumption_bills for insert to authenticated with check (opened_by = app.person_id() and app.can_register_expense(outing_id));--> statement-breakpoint
create policy bill_payers_select on bill_payers for select to authenticated using (app.can_see_bill(bill_id));--> statement-breakpoint
create policy bill_payers_insert on bill_payers for insert to authenticated with check (app.owns_new_bill(bill_id));--> statement-breakpoint
create policy bill_items_select on bill_items for select to authenticated using (app.can_see_bill(bill_id));--> statement-breakpoint
create policy bill_items_insert on bill_items for insert to authenticated with check (app.owns_new_bill(bill_id));--> statement-breakpoint
create policy bill_claims_select on bill_claims for select to authenticated using (app.can_see_bill_item(item_id));--> statement-breakpoint
create policy bill_claims_insert on bill_claims for insert to authenticated with check (marked_by = app.person_id() and app.can_mark_bill_item(item_id));--> statement-breakpoint
create policy bill_claims_update on bill_claims for update to authenticated using (app.can_edit_claim(item_id, person_id)) with check (app.can_edit_claim(item_id, person_id));--> statement-breakpoint
create policy bill_claims_delete on bill_claims for delete to authenticated using (app.can_edit_claim(item_id, person_id));--> statement-breakpoint
create function app.assert_bill_balanced() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  items_total bigint;
  paid bigint;
begin
  select coalesce(sum(total_cents), 0) into items_total from bill_items where bill_id = new.id;
  select coalesce(sum(amount_cents), 0) into paid from bill_payers where bill_id = new.id;
  if items_total = 0 then
    raise exception 'bill_without_items' using errcode = '23514';
  end if;
  if items_total + new.service_charge_cents - new.discount_cents <> paid then
    raise exception 'bill_not_balanced' using errcode = '23514';
  end if;
  if exists (
    select 1 from bill_payers bp
    where bp.bill_id = new.id
      and not exists (select 1 from outing_participants op where op.outing_id = new.outing_id and op.person_id = bp.person_id and op.confirmed_at is not null)
  ) then
    raise exception 'bill_person_not_in_outing' using errcode = '23514';
  end if;
  if exists (
    select 1 from bill_payers bp
    where bp.bill_id = new.id
      and not exists (select 1 from outing_participants op where op.outing_id = new.outing_id and op.person_id = bp.person_id and op.role = 'admin')
      and not exists (select 1 from outing_payers p where p.outing_id = new.outing_id and p.person_id = bp.person_id)
  ) then
    raise exception 'bill_payer_not_declared' using errcode = '23514';
  end if;
  return null;
end
$$;--> statement-breakpoint
create constraint trigger consumption_bills_balanced after insert on consumption_bills deferrable initially deferred for each row execute function app.assert_bill_balanced();--> statement-breakpoint
create function app.guard_bill_claim() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item record;
  bill record;
  claim record;
  acc_num numeric := 0;
  acc_den numeric := 1;
  divisor numeric;
begin
  select i.id, i.bill_id, i.quantity_num, i.quantity_den into item from bill_items i where i.id = new.item_id for update;
  select b.outing_id, b.status into bill from consumption_bills b where b.id = item.bill_id;
  if bill.status <> 'open' then
    raise exception 'bill_not_open' using errcode = '23514';
  end if;
  if not exists (select 1 from outing_participants op where op.outing_id = bill.outing_id and op.person_id = new.person_id and op.confirmed_at is not null) then
    raise exception 'claim_person_not_in_outing' using errcode = '23514';
  end if;
  for claim in select quantity_num as n, quantity_den as d from bill_claims where item_id = new.item_id and person_id <> new.person_id loop
    acc_num := acc_num * claim.d + claim.n * acc_den;
    acc_den := acc_den * claim.d;
    divisor := gcd(acc_num, acc_den);
    acc_num := acc_num / divisor;
    acc_den := acc_den / divisor;
  end loop;
  acc_num := acc_num * new.quantity_den + new.quantity_num * acc_den;
  acc_den := acc_den * new.quantity_den;
  if acc_num * item.quantity_den > item.quantity_num * acc_den then
    raise exception 'item_over_claimed' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end
$$;--> statement-breakpoint
create trigger bill_claims_guard before insert or update on bill_claims for each row execute function app.guard_bill_claim();--> statement-breakpoint
create function app.guard_bill_claim_delete() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from bill_items i join consumption_bills b on b.id = i.bill_id where i.id = old.item_id and b.status <> 'open') then
    raise exception 'bill_not_open' using errcode = '23514';
  end if;
  return old;
end
$$;--> statement-breakpoint
create trigger bill_claims_guard_delete before delete on bill_claims for each row execute function app.guard_bill_claim_delete();--> statement-breakpoint
create function app.guard_bill_update() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.outing_id <> old.outing_id or new.description <> old.description
    or new.opened_by <> old.opened_by or new.occurred_at <> old.occurred_at
    or new.service_charge_cents <> old.service_charge_cents or new.discount_cents <> old.discount_cents
    or new.idempotency_key is distinct from old.idempotency_key or new.created_at <> old.created_at then
    raise exception 'bill_is_immutable' using errcode = '23514';
  end if;
  if old.status = 'closed' or (old.status = new.status and old.status <> 'open') then
    raise exception 'bill_status_change_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger consumption_bills_guard_update before update on consumption_bills for each row execute function app.guard_bill_update();--> statement-breakpoint
create trigger consumption_bills_forbid_delete before delete on consumption_bills for each row execute function app.forbid_change();--> statement-breakpoint
create trigger bill_payers_forbid_change before update or delete on bill_payers for each row execute function app.forbid_change();--> statement-breakpoint
create trigger bill_items_forbid_change before update or delete on bill_items for each row execute function app.forbid_change();
