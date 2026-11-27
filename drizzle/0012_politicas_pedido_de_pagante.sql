create function app.can_see_payer_request(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from payer_requests r where r.id = target and (r.requested_by = app.person_id() or app.is_admin(r.outing_id)))
$$;--> statement-breakpoint
create function app.owns_pending_payer_request(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from payer_requests r where r.id = target and r.requested_by = app.person_id() and r.status = 'pending')
$$;--> statement-breakpoint
revoke delete on payer_requests, payer_request_payers, payer_request_shares from authenticated;--> statement-breakpoint
revoke update on payer_requests, payer_request_payers, payer_request_shares from authenticated;--> statement-breakpoint
grant update (status, decided_by, decided_at, decision_note, result_expense_id) on payer_requests to authenticated;--> statement-breakpoint
create policy payer_requests_select on payer_requests for select to authenticated using (requested_by = app.person_id() or app.is_admin(outing_id));--> statement-breakpoint
create policy payer_requests_insert on payer_requests for insert to authenticated with check (
  requested_by = app.person_id() and app.is_participant(outing_id)
  and exists (select 1 from outings o where o.id = outing_id and o.status = 'active')
);--> statement-breakpoint
create policy payer_requests_update on payer_requests for update to authenticated using (app.is_admin(outing_id)) with check (app.is_admin(outing_id));--> statement-breakpoint
create policy payer_request_payers_select on payer_request_payers for select to authenticated using (app.can_see_payer_request(request_id));--> statement-breakpoint
create policy payer_request_payers_insert on payer_request_payers for insert to authenticated with check (app.owns_pending_payer_request(request_id));--> statement-breakpoint
create policy payer_request_shares_select on payer_request_shares for select to authenticated using (app.can_see_payer_request(request_id));--> statement-breakpoint
create policy payer_request_shares_insert on payer_request_shares for insert to authenticated with check (app.owns_pending_payer_request(request_id));--> statement-breakpoint
create function app.assert_payer_request_balanced() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  paid bigint;
  shared bigint;
begin
  select coalesce(sum(amount_cents), 0) into paid from payer_request_payers where request_id = new.id;
  select coalesce(sum(amount_cents), 0) into shared from payer_request_shares where request_id = new.id;
  if paid <> new.total_cents or shared <> new.total_cents then
    raise exception 'request_not_balanced' using errcode = '23514';
  end if;
  if not exists (select 1 from payer_request_payers where request_id = new.id and person_id = new.requested_by) then
    raise exception 'requester_must_be_a_payer' using errcode = '23514';
  end if;
  if exists (
    select 1
    from (select person_id from payer_request_payers where request_id = new.id union select person_id from payer_request_shares where request_id = new.id) involved
    where not exists (
      select 1 from outing_participants op
      where op.outing_id = new.outing_id and op.person_id = involved.person_id and op.confirmed_at is not null
    )
  ) then
    raise exception 'request_person_not_in_outing' using errcode = '23514';
  end if;
  return null;
end
$$;--> statement-breakpoint
create constraint trigger payer_requests_balanced after insert on payer_requests deferrable initially deferred for each row execute function app.assert_payer_request_balanced();--> statement-breakpoint
create function app.guard_payer_request_update() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.outing_id <> old.outing_id or new.target_expense_id is distinct from old.target_expense_id
    or new.requested_by <> old.requested_by or new.description <> old.description or new.total_cents <> old.total_cents
    or new.split_method <> old.split_method or new.occurred_at <> old.occurred_at
    or new.idempotency_key is distinct from old.idempotency_key or new.created_at <> old.created_at then
    raise exception 'payer_request_is_immutable' using errcode = '23514';
  end if;
  if old.status <> 'pending' or new.status = 'pending' then
    raise exception 'payer_request_status_change_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger payer_requests_guard_update before update on payer_requests for each row execute function app.guard_payer_request_update();--> statement-breakpoint
create trigger payer_requests_forbid_delete before delete on payer_requests for each row execute function app.forbid_change();--> statement-breakpoint
create trigger payer_request_payers_forbid_change before update or delete on payer_request_payers for each row execute function app.forbid_change();--> statement-breakpoint
create trigger payer_request_shares_forbid_change before update or delete on payer_request_shares for each row execute function app.forbid_change();
