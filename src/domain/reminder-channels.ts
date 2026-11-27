export const reminderChannels = ["whatsapp", "app"] as const;

export type ReminderChannel = (typeof reminderChannels)[number];
