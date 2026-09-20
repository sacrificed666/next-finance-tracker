"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Icon } from "./icons";
import { TextInput } from "./ui";
import { useT } from "@/lib/i18n";
import { passwordStrength, STRENGTH_COLOR } from "@/lib/password-meter";

export function PasswordField({
  value,
  onChange,
  meter,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "size" | "prefix"> & {
  value: string;
  onChange: (value: string) => void;
  meter?: boolean;
}) {
  const { t } = useT();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);

  return (
    <div>
      <div className="relative">
        <TextInput
          {...props}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-12"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? t("profile.password.hide") : t("profile.password.show")}
          className="icon-btn absolute right-1.5 top-1/2 size-9 -translate-y-1/2 text-ink-3"
        >
          <Icon name={visible ? "monitor" : "lock"} size={16} />
        </button>
      </div>
      {meter && value.length > 0 && (
        <div className="mt-2">
          <div className="grid grid-cols-4 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-1.5 rounded-full bg-ghost-2"
                style={i <= Math.max(1, strength.score) ? { background: STRENGTH_COLOR[strength.level] } : undefined}
              />
            ))}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs">
            <span className="font-semibold" style={{ color: STRENGTH_COLOR[strength.level] }}>
              {t(`profile.password.strength.${strength.level}`)}
            </span>
            {(["length", "mix", "symbol"] as const)
              .filter((rule) => !strength.rules[rule])
              .map((rule) => (
                <span key={rule} className="text-ink-3">
                  {t(`profile.password.rule.${rule}`)}
                </span>
              ))}
          </p>
        </div>
      )}
    </div>
  );
}
