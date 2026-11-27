create function app.is_dispute_approver(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from expense_dispute_approvals a where a.dispute_id = target and a.person_id = app.person_id())
$$;--> statement-breakpoint
create function app.owns_dispute(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from expense_disputes d where d.id = target and d.opened_by = app.person_id())
$$;--> statement-breakpoint
create function app.owns_open_dispute(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from expense_disputes d where d.id = target and d.opened_by = app.person_id() and d.status = 'open')
$$;--> statement-breakpoint
revoke update, delete on expense_disputes, expense_dispute_approvals from authenticated;--> statement-breakpoint
create policy expense_disputes_select on expense_disputes for select to authenticated using (opened_by = app.person_id() or app.is_dispute_approver(id));--> statement-breakpoint
create policy expense_disputes_insert on expense_disputes for insert to authenticated with check (
  opened_by = app.person_id() and app.is_participant(outing_id)
  and exists (select 1 from outings o where o.id = outing_id and o.status = 'active')
);--> statement-breakpoint
create policy expense_dispute_approvals_select on expense_dispute_approvals for select to authenticated using (person_id = app.person_id() or app.owns_dispute(dispute_id));--> statement-breakpoint
create policy expense_dispute_approvals_insert on expense_dispute_approvals for insert to authenticated with check (app.owns_open_dispute(dispute_id));--> statement-breakpoint
create function app.guard_dispute_update() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.outing_id <> old.outing_id or new.expense_id <> old.expense_id
    or new.opened_by <> old.opened_by or new.subject <> old.subject or new.message <> old.message or new.created_at <> old.created_at then
    raise exception 'dispute_is_immutable' using errcode = '23514';
  end if;
  if old.status <> 'open' or new.status = 'open' then
    raise exception 'dispute_status_change_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger expense_disputes_guard_update before update on expense_disputes for each row execute function app.guard_dispute_update();--> statement-breakpoint
create trigger expense_disputes_forbid_delete before delete on expense_disputes for each row execute function app.forbid_change();--> statement-breakpoint
create function app.guard_dispute_approval_update() returns trigger language plpgsql as $$
begin
  if new.dispute_id <> old.dispute_id or new.person_id <> old.person_id then
    raise exception 'dispute_approval_is_immutable' using errcode = '23514';
  end if;
  if old.decision <> 'pending' or new.decision = 'pending' then
    raise exception 'dispute_approval_change_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger expense_dispute_approvals_guard_update before update on expense_dispute_approvals for each row execute function app.guard_dispute_approval_update();--> statement-breakpoint
create trigger expense_dispute_approvals_forbid_delete before delete on expense_dispute_approvals for each row execute function app.forbid_change();
