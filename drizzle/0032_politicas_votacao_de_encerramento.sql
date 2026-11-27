revoke all on closing_votes, closing_vote_choices from authenticated;--> statement-breakpoint
grant select on closing_votes, closing_vote_choices to authenticated;--> statement-breakpoint
create policy closing_votes_select on closing_votes for select to authenticated using (app.is_participant(outing_id));--> statement-breakpoint
create policy closing_vote_choices_select on closing_vote_choices for select to authenticated using (
  exists (select 1 from closing_votes v where v.id = vote_id and app.is_participant(v.outing_id))
);
