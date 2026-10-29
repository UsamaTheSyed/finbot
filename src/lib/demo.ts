/** Current business date; browser tests can freeze it without changing production. */
export const demoDate =
  import.meta.env?.VITE_APP_DATE_OVERRIDE || new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date())
