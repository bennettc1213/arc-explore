"use client";

import { useFormStatus } from "react-dom";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

export function PendingButton({
  pendingLabel,
  disabled,
  children,
  ...rest
}: {
  pendingLabel: string;
  disabled?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} disabled={pending || disabled}>
      {pending ? pendingLabel : children}
    </button>
  );
}
