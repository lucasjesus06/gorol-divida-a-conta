"use client";

import { useRef, useState } from "react";
import { OTP_LENGTH, normalizeCode } from "@/domain/otp";
import { cn } from "@/lib/utils";

/**
 * The access code, one box per digit. It is a single real field underneath, laid over the boxes, so a
 * screen reader finds one field called "Código", pasting and the e-mail autofill work as in any field,
 * and the numeric keyboard opens on the phone. The boxes only show what was typed.
 */
export function OtpInput({
  name,
  label,
  length = OTP_LENGTH,
  describedBy,
  invalid,
}: {
  name: string;
  label: string;
  length?: number;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const active = Math.min(value.length, length - 1);

  function atEnd() {
    const element = field.current;
    if (element) {
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm font-medium">
      <label htmlFor={`${name}-otp`}>{label}</label>
      <div className="relative">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden>
          {Array.from({ length }, (_, index) => (
            <span
              key={index}
              className={cn(
                "grid h-12 place-items-center rounded-2xl border bg-background text-lg font-semibold",
                invalid ? "border-destructive" : "border-input",
                focused && index === active && "ring-2 ring-ring",
              )}
            >
              {value[index] ?? ""}
            </span>
          ))}
        </div>
        <input
          ref={field}
          id={`${name}-otp`}
          name={name}
          value={value}
          onChange={(event) => setValue(normalizeCode(event.target.value, length))}
          onPaste={(event) => {
            event.preventDefault();
            setValue(normalizeCode(event.clipboardData.getData("text"), length));
          }}
          onFocus={() => {
            setFocused(true);
            atEnd();
          }}
          onBlur={() => setFocused(false)}
          onClick={atEnd}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={length * 2}
          required
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none"
        />
      </div>
    </div>
  );
}
