revoke update, delete on payments from authenticated;--> statement-breakpoint
grant update (status, confirmed_by, resolved_at) on payments to authenticated;--> statement-breakpoint
create policy payments_select on payments for select to authenticated using (app.is_participant(outing_id));--> statement-breakpoint
create policy payments_insert on payments for insert to authenticated with check (
  from_id = app.person_id() and app.is_participant(outing_id)
  and exists (select 1 from outings o where o.id = outing_id and o.status = 'active')
);--> statement-breakpoint
create policy payments_update on payments for update to authenticated using (to_id = app.person_id() and app.is_participant(outing_id)) with check (to_id = app.person_id() and app.is_participant(outing_id));--> statement-breakpoint
create function app.assert_payment_people() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1
    from (select new.from_id as person_id union select new.to_id union select new.on_behalf_of_id where new.on_behalf_of_id is not null) involved
    where not exists (
      select 1 from outing_participants op
      where op.outing_id = new.outing_id and op.person_id = involved.person_id and op.confirmed_at is not null
    )
  ) then
    raise exception 'payment_person_not_in_outing' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger payments_people before insert on payments for each row execute function app.assert_payment_people();--> statement-breakpoint
create function app.guard_payment_update() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.outing_id <> old.outing_id or new.from_id <> old.from_id or new.to_id <> old.to_id
    or new.on_behalf_of_id is distinct from old.on_behalf_of_id or new.amount_cents <> old.amount_cents
    or new.declared_at <> old.declared_at or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'payment_is_immutable' using errcode = '23514';
  end if;
  if old.status <> 'declared' or new.status not in ('confirmed', 'rejected') then
    raise exception 'payment_status_change_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger payments_guard_update before update on payments for each row execute function app.guard_payment_update();--> statement-breakpoint
create trigger payments_forbid_delete before delete on payments for each row execute function app.forbid_change();
