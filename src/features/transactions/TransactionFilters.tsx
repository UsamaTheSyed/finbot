import { FilterBar } from "../../components/common/Page";
import { Select } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import type { Party } from "../../types";
export interface FilterValues {
  type: string;
  date: string;
  partyId: string;
  status: string;
}
export const emptyFilters: FilterValues = {
  type: "",
  date: "",
  partyId: "",
  status: "",
};
export function TransactionFilters({
  values,
  onChange,
  parties,
}: {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  parties: Party[];
}) {
  const update = (key: keyof FilterValues, value: string) =>
    onChange({ ...values, [key]: value });
  return (
    <FilterBar>
      <Select
        label="Type"
        value={values.type}
        onChange={(e) => update("type", e.target.value)}
      >
        <option value="">All Transactions</option>
        <option>Sale</option>
        <option>Purchase</option>
      </Select>
      <Select
        label="Date Range"
        value={values.date}
        onChange={(e) => update("date", e.target.value)}
      >
        <option value="">All Dates</option>
        <option value="recent">Nov 19 - Nov 28</option>
        <option value="november">November 2026</option>
        <option value="october">October 2026</option>
      </Select>
      <Select
        label="Party"
        value={values.partyId}
        onChange={(e) => update("partyId", e.target.value)}
      >
        <option value="">All Parties</option>
        {parties.map((p) => (
          <option value={p.id} key={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Select
        label="Status"
        value={values.status}
        onChange={(e) => update("status", e.target.value)}
      >
        <option value="">All Statuses</option>
        {["Completed", "Partial", "Overdue", "Unpaid"].map((status) => (
          <option key={status}>{status}</option>
        ))}
      </Select>
      <Button onClick={() => onChange(emptyFilters)}>Clear Filters</Button>
    </FilterBar>
  );
}
