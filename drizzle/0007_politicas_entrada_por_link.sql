revoke all on outing_join_links, outing_join_requests, outing_join_attempts from authenticated;--> statement-breakpoint
create or replace function app.is_participant(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from outing_participants where outing_id = target and person_id = app.person_id() and confirmed_at is not null)
$$;--> statement-breakpoint
create or replace function app.is_admin(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from outing_participants where outing_id = target and person_id = app.person_id() and role = 'admin' and confirmed_at is not null)
$$;--> statement-breakpoint
create or replace function app.shares_outing_with(other uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from outing_participants mine
    join outing_participants theirs on theirs.outing_id = mine.outing_id
    where mine.person_id = app.person_id() and mine.confirmed_at is not null
      and theirs.person_id = other and theirs.confirmed_at is not null
  )
$$;
