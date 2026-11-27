create function app.can_register_expense(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from outings where id = target and status = 'active')
    and (
      app.is_admin(target)
      or exists (
        select 1
        from outing_payers p
        join outing_participants op on op.outing_id = p.outing_id and op.person_id = p.person_id
        where p.outing_id = target and p.person_id = app.person_id() and op.confirmed_at is not null
      )
    )
$$;--> statement-breakpoint
create function app.is_participant_of_expense(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from expenses e where e.id = target and app.is_participant(e.outing_id))
$$;--> statement-breakpoint
create function app.can_write_expense_parts(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from expenses e where e.id = target and e.registered_by = app.person_id() and app.can_register_expense(e.outing_id))
$$;--> statement-breakpoint
revoke delete on expenses, expense_payers, expense_shares, outing_payers from authenticated;--> statement-breakpoint
revoke update on expenses, expense_payers, expense_shares, outing_payers from authenticated;--> statement-breakpoint
grant update (status, voided_by, void_reason) on expenses to authenticated;--> statement-breakpoint
create policy outing_payers_select on outing_payers for select to authenticated using (app.is_participant(outing_id));--> statement-breakpoint
create policy outing_payers_insert on outing_payers for insert to authenticated with check (app.is_admin(outing_id) and declared_by = app.person_id());--> statement-breakpoint
create policy expenses_select on expenses for select to authenticated using (app.is_participant(outing_id));--> statement-breakpoint
create policy expenses_insert on expenses for insert to authenticated with check (registered_by = app.person_id() and app.can_register_expense(outing_id));--> statement-breakpoint
create policy expenses_update on expenses for update to authenticated using (app.can_register_expense(outing_id) and (registered_by = app.person_id() or app.is_admin(outing_id))) with check (app.can_register_expense(outing_id) and (registered_by = app.person_id() or app.is_admin(outing_id)));--> statement-breakpoint
create policy expense_payers_select on expense_payers for select to authenticated using (app.is_participant_of_expense(expense_id));--> statement-breakpoint
create policy expense_payers_insert on expense_payers for insert to authenticated with check (app.can_write_expense_parts(expense_id));--> statement-breakpoint
create policy expense_shares_select on expense_shares for select to authenticated using (app.is_participant_of_expense(expense_id));--> statement-breakpoint
create policy expense_shares_insert on expense_shares for insert to authenticated with check (app.can_write_expense_parts(expense_id));--> statement-breakpoint
create function app.assert_expense_balanced() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  paid bigint;
  shared bigint;
begin
  select coalesce(sum(amount_cents), 0) into paid from expense_payers where expense_id = new.id;
  select coalesce(sum(amount_cents), 0) into shared from expense_shares where expense_id = new.id;
  if paid <> new.total_cents or shared <> new.total_cents then
    raise exception 'expense_not_balanced' using errcode = '23514';
  end if;
  if exists (
    select 1
    from (select person_id from expense_payers where expense_id = new.id union select person_id from expense_shares where expense_id = new.id) involved
    where not exists (
      select 1 from outing_participants op
      where op.outing_id = new.outing_id and op.person_id = involved.person_id and op.confirmed_at is not null
    )
  ) then
    raise exception 'expense_person_not_in_outing' using errcode = '23514';
  end if;
  if exists (
    select 1 from expense_payers ep
    where ep.expense_id = new.id
      and not exists (select 1 from outing_participants op where op.outing_id = new.outing_id and op.person_id = ep.person_id and op.role = 'admin')
      and not exists (select 1 from outing_payers p where p.outing_id = new.outing_id and p.person_id = ep.person_id)
  ) then
    raise exception 'expense_payer_not_declared' using errcode = '23514';
  end if;
  return null;
end
$$;--> statement-breakpoint
create constraint trigger expenses_balanced after insert on expenses deferrable initially deferred for each row execute function app.assert_expense_balanced();--> statement-breakpoint
create function app.guard_expense_update() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.outing_id <> old.outing_id or new.version <> old.version
    or new.previous_version_id is distinct from old.previous_version_id
    or new.description <> old.description or new.total_cents <> old.total_cents
    or new.split_method <> old.split_method or new.occurred_at <> old.occurred_at
    or new.registered_by <> old.registered_by or new.created_at <> old.created_at
    or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'expense_is_immutable' using errcode = '23514';
  end if;
  if old.status <> 'active' or new.status = 'active' then
    raise exception 'expense_status_change_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger expenses_guard_update before update on expenses for each row execute function app.guard_expense_update();--> statement-breakpoint
create function app.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'financial_history_is_immutable' using errcode = '23514';
end
$$;--> statement-breakpoint
create trigger expenses_forbid_delete before delete on expenses for each row execute function app.forbid_change();--> statement-breakpoint
create trigger expense_payers_forbid_change before update or delete on expense_payers for each row execute function app.forbid_change();--> statement-breakpoint
create trigger expense_shares_forbid_change before update or delete on expense_shares for each row execute function app.forbid_change();
