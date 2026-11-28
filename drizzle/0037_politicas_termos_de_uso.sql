revoke all on terms_acceptances from authenticated;--> statement-breakpoint
grant select on terms_acceptances to authenticated;--> statement-breakpoint
create policy terms_acceptances_select on terms_acceptances for select to authenticated using (person_id = app.person_id());--> statement-breakpoint
create function app.guard_terms_acceptance() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'terms_acceptance_is_permanent' using errcode = '23514';
  end if;
  if new.id <> old.id or new.person_id <> old.person_id or new.version <> old.version
    or new.accepted_at <> old.accepted_at or new.reminders_consent <> old.reminders_consent then
    raise exception 'terms_acceptance_is_immutable' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger terms_acceptances_guard before update or delete on terms_acceptances for each row execute function app.guard_terms_acceptance();
