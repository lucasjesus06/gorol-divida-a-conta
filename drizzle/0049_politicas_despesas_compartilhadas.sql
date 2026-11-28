revoke update, delete on shared_funds from authenticated;--> statement-breakpoint
grant update (status, accepted_at, ended_at, ended_by) on shared_funds to authenticated;--> statement-breakpoint
create policy shared_funds_select on shared_funds for select to authenticated using (person_a = app.person_id() or person_b = app.person_id());--> statement-breakpoint
create policy shared_funds_insert on shared_funds for insert to authenticated with check (
  requested_by = app.person_id() and (person_a = app.person_id() or person_b = app.person_id()) and status = 'pending'
);--> statement-breakpoint
create policy shared_funds_update on shared_funds for update to authenticated
  using (person_a = app.person_id() or person_b = app.person_id())
  with check (person_a = app.person_id() or person_b = app.person_id());--> statement-breakpoint
create function app.assert_shared_fund_insert() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from (select new.person_a as person_id union select new.person_b) involved
    join people p on p.id = involved.person_id
    where p.user_id is null or p.account_approved_at is null
  ) then
    raise exception 'shared_fund_needs_accounts' using errcode = '23514';
  end if;
  if exists (
    select 1 from shared_funds f
    where f.status in ('pending', 'active')
      and (f.person_a in (new.person_a, new.person_b) or f.person_b in (new.person_a, new.person_b))
  ) then
    raise exception 'shared_fund_person_already_in_one' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger shared_funds_insert_check before insert on shared_funds for each row execute function app.assert_shared_fund_insert();--> statement-breakpoint
create function app.guard_shared_fund_update() returns trigger language plpgsql as $$
declare
  me uuid := app.person_id();
begin
  if new.id <> old.id or new.person_a <> old.person_a or new.person_b <> old.person_b
    or new.requested_by <> old.requested_by or new.created_at <> old.created_at then
    raise exception 'shared_fund_is_immutable' using errcode = '23514';
  end if;
  if old.status = 'pending' and new.status in ('active', 'declined') then
    if me is not null and me = old.requested_by then
      raise exception 'shared_fund_only_the_other_answers' using errcode = '23514';
    end if;
    if new.status = 'declined' and (new.accepted_at is not null or new.ended_at is not null) then
      raise exception 'shared_fund_status_change_invalid' using errcode = '23514';
    end if;
  elsif old.status = 'active' and new.status = 'ended' then
    if new.accepted_at is distinct from old.accepted_at or new.ended_by is null then
      raise exception 'shared_fund_status_change_invalid' using errcode = '23514';
    end if;
  else
    raise exception 'shared_fund_status_change_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger shared_funds_guard_update before update on shared_funds for each row execute function app.guard_shared_fund_update();--> statement-breakpoint
create trigger shared_funds_forbid_delete before delete on shared_funds for each row execute function app.forbid_change();
