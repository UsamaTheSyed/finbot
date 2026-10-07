import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { partySchema, type PartyInput } from "../../domain/validation";
import type { Party } from "../../types";
import { Modal } from "../../components/ui/Overlays";
import { Input, Select, Textarea } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { useFinanceMutations } from "../finance/queries";
export function PartyFormDialog({
  party,
  onClose,
}: {
  party?: Party;
  onClose: () => void;
}) {
  const { saveParty } = useFinanceMutations(),
    notify = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PartyInput>({
    resolver: zodResolver(partySchema),
    defaultValues: party || {
      kind: "Customer",
      name: "",
      phone: "",
      email: "",
      ntn: "",
      address: "",
      paymentTerms: "Net 30",
    },
  });
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !saveParty.isPending) onClose();
      }}
      title={party ? "Edit Party" : "Add Party"}
      className="party-form-modal"
    >
      <form
        className="form-stack"
        noValidate
        onSubmit={handleSubmit(async (data) => {
          try {
            await saveParty.mutateAsync({ id: party?.id, data });
            notify(party ? "Party updated." : "Party created.", "success");
            onClose();
          } catch (e) {
            setError("root", { message: (e as Error).message });
          }
        })}
      >
        <Select label="Party Type" {...register("kind")}>
          <option>Customer</option>
          <option>Supplier</option>
        </Select>
        <Input
          label="Name *"
          {...register("name")}
          error={errors.name?.message}
        />
        <Input
          label="Phone"
          {...register("phone")}
          error={errors.phone?.message}
        />
        <Input
          label="Email"
          type="email"
          {...register("email")}
          error={errors.email?.message}
        />
        <Input
          label="Business ID / NTN"
          {...register("ntn")}
          error={errors.ntn?.message}
        />
        <Textarea
          label="Address"
          rows={3}
          {...register("address")}
          error={errors.address?.message}
        />
        <Select label="Payment Terms" {...register("paymentTerms")}>
          {["Due on receipt", "Net 15", "Net 30", "Net 60"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
        {errors.root && <Alert>{errors.root.message}</Alert>}
        <div className="dialog-actions">
          <Button disabled={saveParty.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saveParty.isPending}>
            {party ? "Save Changes" : "Add Party"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
