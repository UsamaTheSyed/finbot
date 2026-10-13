export function logBotFailure(
  error: unknown,
  stage: "request" | "database" | "execution",
) {
  const candidate =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;

  const code =
    typeof candidate === "string" &&
    /^[A-Z0-9_]{1,40}$/.test(candidate)
      ? candidate
      : "BOT_FAILURE";

  // Only known, fixed messages; never log arbitrary error text.
  const knownReasons: Record<string, string> = {
    "Amount saaf likhein, misal 15k ya 15000.50.":
      "AMOUNT_FORMAT_INVALID",
    "Amount supported limit se zyada hai.":
      "AMOUNT_TOO_LARGE",
    "Ek absolute transaction date YYYY-MM-DD mein dein.":
      "SINGLE_DATE_REQUIRED",
    "AI_UNAVAILABLE": "AI_UNAVAILABLE",
  };

  const reason =
    error instanceof Error
      ? knownReasons[error.message] ?? "UNCLASSIFIED"
      : "NON_ERROR_THROWN";

  // Stack locations only; exclude the error message and parameters.
  const locations =
    error instanceof Error
      ? error.stack
          ?.split("\n")
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 4)
      : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      event: "bot_failure",
      stage,
      code,
      reason,
      locations,
    }),
  );
}