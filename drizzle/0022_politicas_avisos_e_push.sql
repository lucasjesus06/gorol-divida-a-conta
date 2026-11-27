revoke all on notifications, push_subscriptions from authenticated;--> statement-breakpoint
grant select, update (read_at) on notifications to authenticated;--> statement-breakpoint
grant select, insert, delete on push_subscriptions to authenticated;--> statement-breakpoint
create policy notifications_select on notifications for select to authenticated using (person_id = app.person_id());--> statement-breakpoint
create policy notifications_update on notifications for update to authenticated using (person_id = app.person_id()) with check (person_id = app.person_id());--> statement-breakpoint
create policy push_subscriptions_select on push_subscriptions for select to authenticated using (person_id = app.person_id());--> statement-breakpoint
create policy push_subscriptions_insert on push_subscriptions for insert to authenticated with check (person_id = app.person_id());--> statement-breakpoint
create policy push_subscriptions_delete on push_subscriptions for delete to authenticated using (person_id = app.person_id());--> statement-breakpoint
create function app.guard_notification_update() returns trigger language plpgsql as $$
begin
  if old.read_at is not null then
    raise exception 'notification_already_read' using errcode = '23514';
  end if;
  return new;
end
$$;--> statement-breakpoint
create trigger notifications_guard_update before update on notifications for each row execute function app.guard_notification_update();
