do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;--> statement-breakpoint
create schema if not exists app;--> statement-breakpoint
grant usage on schema app to authenticated;--> statement-breakpoint
grant usage on schema public to authenticated;--> statement-breakpoint
grant select, insert, update, delete on all tables in schema public to authenticated;--> statement-breakpoint
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;--> statement-breakpoint
revoke all on people from authenticated;--> statement-breakpoint
grant select (id, display_name, created_at), update (display_name) on people to authenticated;--> statement-breakpoint
revoke delete on outings from authenticated;--> statement-breakpoint
create function app.person_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.person_id', true), '')::uuid
$$;--> statement-breakpoint
create function app.is_participant(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from outing_participants where outing_id = target and person_id = app.person_id())
$$;--> statement-breakpoint
create function app.is_admin(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from outing_participants where outing_id = target and person_id = app.person_id() and role = 'admin')
$$;--> statement-breakpoint
create function app.created_outing(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from outings where id = target and created_by = app.person_id())
$$;--> statement-breakpoint
create function app.shares_outing_with(other uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from outing_participants mine
    join outing_participants theirs on theirs.outing_id = mine.outing_id
    where mine.person_id = app.person_id() and theirs.person_id = other
  )
$$;--> statement-breakpoint
create policy people_select on people for select to authenticated using (id = app.person_id() or app.shares_outing_with(id));--> statement-breakpoint
create policy people_update on people for update to authenticated using (id = app.person_id()) with check (id = app.person_id());--> statement-breakpoint
create policy outings_select on outings for select to authenticated using (app.is_participant(id) or (created_by = app.person_id() and created_at = now()));--> statement-breakpoint
create policy outings_insert on outings for insert to authenticated with check (created_by = app.person_id());--> statement-breakpoint
create policy outings_update on outings for update to authenticated using (app.is_admin(id)) with check (app.is_admin(id));--> statement-breakpoint
create policy outing_participants_select on outing_participants for select to authenticated using (person_id = app.person_id() or app.is_participant(outing_id));--> statement-breakpoint
create policy outing_participants_insert on outing_participants for insert to authenticated with check (app.is_admin(outing_id) or (role = 'admin' and person_id = app.person_id() and app.created_outing(outing_id)));--> statement-breakpoint
create policy outing_participants_update on outing_participants for update to authenticated using (app.is_admin(outing_id)) with check (app.is_admin(outing_id));--> statement-breakpoint
create policy outing_participants_delete on outing_participants for delete to authenticated using (person_id = app.person_id() or app.is_admin(outing_id));
