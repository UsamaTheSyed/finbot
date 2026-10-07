export const formatCurrency = (amount: number) =>
  `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(amount)}`;
export const formatMetadataDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
export const formatDate = (date: string, long = false) =>
  new Intl.DateTimeFormat("en-US", {
    month: long ? "long" : "short",
    day: "numeric",
    ...(long ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
