update people set account_approved_at = created_at where user_id is not null;--> statement-breakpoint
revoke all on super_admins, access_requests, access_invites from authenticated;--> statement-breakpoint
create function app.is_account() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from people where id = app.person_id() and user_id is not null and account_approved_at is not null)
$$;--> statement-breakpoint
drop policy outings_insert on outings;--> statement-breakpoint
create policy outings_insert on outings for insert to authenticated with check (created_by = app.person_id() and app.is_account());
