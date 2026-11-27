revoke all on files from authenticated;--> statement-breakpoint
grant select on files to authenticated;--> statement-breakpoint
create policy files_select on files for select to authenticated using (
  status = 'ready' and (
    (kind = 'profile_photo' and (owner_id = app.person_id() or app.shares_outing_with(owner_id)))
    or (outing_id is not null and app.is_participant(outing_id))
  )
);
