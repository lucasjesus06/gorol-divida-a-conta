revoke all on outing_reopenings from authenticated;--> statement-breakpoint
grant select on outing_reopenings to authenticated;--> statement-breakpoint
create policy outing_reopenings_select on outing_reopenings for select to authenticated using (app.is_participant(outing_id));--> statement-breakpoint
create trigger outing_reopenings_forbid_change before update or delete on outing_reopenings for each row execute function app.forbid_change();
