revoke all on system_parameters, system_parameter_changes from authenticated;--> statement-breakpoint
create trigger system_parameter_changes_forbid_change before update or delete on system_parameter_changes for each row execute function app.forbid_change();
