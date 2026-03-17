export type ValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateRequiredText(
  value: unknown,
  field: string
): ValidationResult {
  if (!isNonEmptyString(value)) {
    return {
      ok: false,
      message: `${field} is required.`
    };
  }

  return { ok: true };
}

export function parseIntegerField(
  value: unknown,
  field: string
): { ok: true; value: number } | { ok: false; message: string } {
  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed)) {
    return {
      ok: false,
      message: `${field} must be an integer.`
    };
  }

  return {
    ok: true,
    value: parsed
  };
}

export function validateOptionalFile(
  value: unknown
): { ok: true; file: File | null } | { ok: false; message: string } {
  if (value == null) {
    return {
      ok: true,
      file: null
    };
  }

  if (!(value instanceof File) || value.size === 0) {
    return {
      ok: true,
      file: null
    };
  }

  return {
    ok: true,
    file: value
  };
}
