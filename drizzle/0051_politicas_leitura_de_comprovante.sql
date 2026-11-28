revoke update, delete on payment_receipt_readings from authenticated;--> statement-breakpoint
create policy payment_receipt_readings_select on payment_receipt_readings for select to authenticated using (outing_id in (select app.my_outing_ids()));--> statement-breakpoint
create policy payment_receipt_readings_insert on payment_receipt_readings for insert to authenticated with check (
  exists (select 1 from payments p where p.id = payment_id and p.outing_id = outing_id and p.from_id = app.person_id())
);--> statement-breakpoint
create trigger payment_receipt_readings_forbid_change before update or delete on payment_receipt_readings for each row execute function app.forbid_change();--> statement-breakpoint
grant update (contest_reason, contestable_until) on payments to authenticated;--> statement-breakpoint
create or replace function app.guard_payment_update() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.outing_id <> old.outing_id or new.from_id <> old.from_id or new.to_id <> old.to_id
    or new.on_behalf_of_id is distinct from old.on_behalf_of_id or new.amount_cents <> old.amount_cents
    or new.declared_at <> old.declared_at or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'payment_is_immutable' using errcode = '23514';
  end if;
  if new.contestable_until is distinct from old.contestable_until
    and not (old.status = 'declared' and new.status = 'confirmed' and new.confirmed_by = 'receipt')
    and old.status <> 'contested' then
    raise exception 'payment_is_immutable' using errcode = '23514';
  end if;
  if old.status in ('declared', 'contested') and new.status in ('confirmed', 'rejected') then
    if new.status = 'confirmed' and new.confirmed_by = 'receipt' and old.status <> 'declared' then
      raise exception 'payment_status_change_invalid' using errcode = '23514';
    end if;
  elsif old.status = 'confirmed' and old.confirmed_by = 'receipt' and new.status = 'contested' then
    if old.contestable_until is null or now() > old.contestable_until then
      raise exception 'payment_contest_window_closed' using errcode = '23514';
    end if;
  else
    raise exception 'payment_status_change_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;
