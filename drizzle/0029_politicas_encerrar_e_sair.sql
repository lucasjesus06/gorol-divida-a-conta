create or replace function app.is_participant(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from outing_participants where outing_id = target and person_id = app.person_id() and confirmed_at is not null and left_at is null)
$$;--> statement-breakpoint
create or replace function app.is_admin(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from outing_participants where outing_id = target and person_id = app.person_id() and role = 'admin' and confirmed_at is not null and left_at is null)
$$;--> statement-breakpoint
create or replace function app.shares_outing_with(other uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from outing_participants mine
    join outing_participants theirs on theirs.outing_id = mine.outing_id
    where mine.person_id = app.person_id() and mine.confirmed_at is not null and mine.left_at is null
      and theirs.person_id = other and theirs.confirmed_at is not null and theirs.left_at is null
  )
$$;--> statement-breakpoint
create function app.guard_participant_return() returns trigger language plpgsql as $$
begin
  if old.left_at is not null and new.left_at is null then
    raise exception 'participant_left_is_final' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger outing_participants_guard_return before update on outing_participants for each row execute function app.guard_participant_return();
