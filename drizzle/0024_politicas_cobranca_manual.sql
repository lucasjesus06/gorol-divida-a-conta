revoke all on reminder_log, reminder_pauses, message_templates from authenticated;--> statement-breakpoint
create trigger reminder_log_forbid_change before update or delete on reminder_log for each row execute function app.forbid_change();--> statement-breakpoint
create trigger reminder_pauses_forbid_change before update or delete on reminder_pauses for each row execute function app.forbid_change();
