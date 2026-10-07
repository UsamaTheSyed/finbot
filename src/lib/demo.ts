/** Current business date; browser tests can freeze it without changing production. */
export const demoDate =
  import.meta.env?.VITE_APP_DATE_OVERRIDE || new Date().toISOString().slice(0, 10);
