create function app.my_outing_ids() returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select outing_id from outing_participants where person_id = app.person_id() and confirmed_at is not null and left_at is null
$$;--> statement-breakpoint
grant execute on function app.my_outing_ids() to authenticated;--> statement-breakpoint
drop policy expenses_select on expenses;--> statement-breakpoint
create policy expenses_select on expenses for select to authenticated using (outing_id in (select app.my_outing_ids()));--> statement-breakpoint
drop policy expense_payers_select on expense_payers;--> statement-breakpoint
create policy expense_payers_select on expense_payers for select to authenticated using (outing_id in (select app.my_outing_ids()));--> statement-breakpoint
drop policy expense_shares_select on expense_shares;--> statement-breakpoint
create policy expense_shares_select on expense_shares for select to authenticated using (outing_id in (select app.my_outing_ids()));--> statement-breakpoint
drop policy payments_select on payments;--> statement-breakpoint
create policy payments_select on payments for select to authenticated using (outing_id in (select app.my_outing_ids()));
