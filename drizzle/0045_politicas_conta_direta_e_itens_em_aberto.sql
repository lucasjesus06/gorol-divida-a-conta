create or replace function app.assert_bill_balanced() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  items_total bigint;
  paid bigint;
  payer_count integer;
begin
  select coalesce(sum(amount_cents), 0), count(*) into paid, payer_count from bill_payers where bill_id = new.id;
  if tg_op = 'INSERT' and payer_count = 0 then
    -- A bill opened without payers is a draft: it is checked when it leaves "open", with the payers chosen then.
    return null;
  end if;
  if new.mode = 'direct' then
    items_total := new.direct_total_cents;
  else
    select coalesce(sum(total_cents), 0) into items_total from bill_items where bill_id = new.id;
  end if;
  if items_total is null or items_total = 0 then
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
create constraint trigger consumption_bills_balanced_on_close after update on consumption_bills deferrable initially deferred for each row when (old.status = 'open' and new.status <> 'open') execute function app.assert_bill_balanced();--> statement-breakpoint
create or replace function app.guard_bill_update() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.outing_id <> old.outing_id or new.description <> old.description
    or new.opened_by <> old.opened_by or new.occurred_at <> old.occurred_at or new.mode <> old.mode
    or new.idempotency_key is distinct from old.idempotency_key or new.created_at <> old.created_at then
    raise exception 'bill_is_immutable' using errcode = '23514';
  end if;
  if (new.service_charge_cents <> old.service_charge_cents or new.discount_cents <> old.discount_cents
      or new.direct_total_cents is distinct from old.direct_total_cents)
    and not (old.status = 'open' and new.status = 'open') then
    raise exception 'bill_is_immutable' using errcode = '23514';
  end if;
  if old.status = 'closed' or (old.status = new.status and old.status <> 'open') then
    raise exception 'bill_status_change_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
drop policy consumption_bills_insert on consumption_bills;--> statement-breakpoint
create policy consumption_bills_insert on consumption_bills for insert to authenticated with check (
  opened_by = app.person_id() and app.is_participant(outing_id)
  and exists (select 1 from outings o where o.id = outing_id and o.status = 'active')
);--> statement-breakpoint
create function app.can_add_bill_item(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from consumption_bills b join outings o on o.id = b.outing_id
    where b.id = target and b.status = 'open' and o.status = 'active' and app.is_participant(b.outing_id)
  )
$$;--> statement-breakpoint
create function app.can_edit_bill_item(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from bill_items i join consumption_bills b on b.id = i.bill_id
    where i.id = target and b.status = 'open' and app.is_participant(b.outing_id)
      and (i.added_by = app.person_id() or b.opened_by = app.person_id() or app.is_admin(b.outing_id))
  )
$$;--> statement-breakpoint
drop policy bill_items_insert on bill_items;--> statement-breakpoint
create policy bill_items_insert on bill_items for insert to authenticated with check (added_by = app.person_id() and app.can_add_bill_item(bill_id));--> statement-breakpoint
grant update (description, total_cents, quantity_num, quantity_den), delete on bill_items to authenticated;--> statement-breakpoint
create policy bill_items_update on bill_items for update to authenticated using (app.can_edit_bill_item(id)) with check (app.can_edit_bill_item(id));--> statement-breakpoint
create policy bill_items_delete on bill_items for delete to authenticated using (app.can_edit_bill_item(id));--> statement-breakpoint
drop trigger bill_items_forbid_change on bill_items;--> statement-breakpoint
create function app.guard_bill_item_change() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from consumption_bills b where b.id = old.bill_id and b.status <> 'open') then
    raise exception 'bill_not_open' using errcode = '23514';
  end if;
  if exists (select 1 from bill_claims c where c.item_id = old.id) then
    raise exception 'item_has_claims' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.bill_id <> old.bill_id or new.position <> old.position or new.added_by is distinct from old.added_by then
      raise exception 'bill_item_is_immutable' using errcode = '23514';
    end if;
    return new;
  end if;
  return old;
end
$$;--> statement-breakpoint
create trigger bill_items_guard_change before update or delete on bill_items for each row execute function app.guard_bill_item_change();--> statement-breakpoint
create function app.assign_bill_item_position() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.bill_id::text));
  select coalesce(max(position) + 1, 0) into new.position from bill_items where bill_id = new.bill_id;
  return new;
end
$$;--> statement-breakpoint
create trigger bill_items_assign_position before insert on bill_items for each row execute function app.assign_bill_item_position();
