revoke all on outing_settings from authenticated;--> statement-breakpoint
grant select on outing_settings to authenticated;--> statement-breakpoint
create policy outing_settings_select on outing_settings for select to authenticated using (app.is_participant(outing_id));
