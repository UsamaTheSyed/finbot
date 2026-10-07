import { useFieldArray, useFormContext } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import type { InvoiceInput } from "../../domain/validation";
import { Input } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { calculateLineTotal } from "../../domain/invoiceCalculations";
import { toMinor } from "../../utils/money";
import { Money } from "../finance/components";
export const blankInvoiceItem = {
  item: "",
  description: "",
  quantity: 1,
  unit: "pcs",
  rate: 0,
  taxPercent: 0,
};
export function InvoiceItemFields() {
  const {
      control,
      register,
      watch,
      formState: { errors },
    } = useFormContext<InvoiceInput>(),
    { fields, append, remove } = useFieldArray({ control, name: "items" }),
    items = watch("items");
  const amounts = items.map((l) => {
    try {
      return calculateLineTotal({ ...l, rateMinor: toMinor(l.rate) });
    } catch {
      return 0;
    }
  });
  return (
    <Card className="table-card invoice-item-editor">
      <div className="section-heading">
        <h2>Items</h2>
      </div>
      <Table aria-label="Invoice line items" className="finance-table">
        <TableHeader>
          <TableRow>
            {[
              "Item",
              "Description",
              "Quantity",
              "Unit",
              "Rate (PKR)",
              "Tax %",
              "Amount",
              "",
            ].map((v, i) => (
              <th key={i}>{v}</th>
            ))}
          </TableRow>
        </TableHeader>
        <tbody>
          {fields.map((field, index) => {
            const error = errors.items?.[index];
            return (
              <TableRow key={field.id}>
                <td>
                  <Input
                    label={`Item ${index + 1}`}
                    {...register(`items.${index}.item`)}
                    error={error?.item?.message}
                  />
                </td>
                <td>
                  <Input
                    label={`Description ${index + 1}`}
                    {...register(`items.${index}.description`)}
                    error={error?.description?.message}
                  />
                </td>
                <td>
                  <Input
                    label={`Quantity ${index + 1}`}
                    type="number"
                    min="0.001"
                    step="0.001"
                    {...register(`items.${index}.quantity`, {
                      valueAsNumber: true,
                    })}
                    error={error?.quantity?.message}
                  />
                </td>
                <td>
                  <Input
                    label={`Unit ${index + 1}`}
                    {...register(`items.${index}.unit`)}
                    error={error?.unit?.message}
                  />
                </td>
                <td>
                  <Input
                    label={`Rate ${index + 1}`}
                    type="number"
                    min="0"
                    step="0.01"
                    {...register(`items.${index}.rate`, {
                      valueAsNumber: true,
                    })}
                    error={error?.rate?.message}
                  />
                </td>
                <td>
                  <Input
                    label={`Tax ${index + 1}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    {...register(`items.${index}.taxPercent`, {
                      valueAsNumber: true,
                    })}
                    error={error?.taxPercent?.message}
                  />
                </td>
                <td>
                  <Money value={amounts[index]} />
                </td>
                <td>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove item ${index + 1}`}
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </td>
              </TableRow>
            );
          })}
        </tbody>
      </Table>
      <div className="section-heading">
        <Button
          variant="ghost"
          disabled={fields.length >= 100}
          onClick={() => append({ ...blankInvoiceItem })}
        >
          <Plus size={16} /> Add Item
        </Button>
        {errors.items?.root && (
          <span role="alert">{errors.items.root.message}</span>
        )}
      </div>
    </Card>
  );
}
