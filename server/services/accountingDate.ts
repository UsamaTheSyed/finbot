import type { Queryable } from "./ledger.js";
import { businessDate } from "./ledger.js";
import { ApiError } from "../lib/errors.js";
/** A future journal must not advance the posting date and lock out today's work. */
export async function validateAccountingDate(
  c: Queryable,
  businessId: string,
  date: string,
) {
  if (
    date > businessDate() &&
    (
      await c.query("select 1 from accounting_cutovers where business_id=$1", [
        businessId,
      ])
    ).rowCount
  ) {
    throw new ApiError(
      409,
      "ACCOUNTING_FUTURE_DATE",
      "Future-dated financial postings are not allowed after accounting activation. Save a draft and issue it on its posting date.",
    );
  }
}
