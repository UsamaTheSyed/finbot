import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { PageHeader } from "../../components/common/Page";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Display";
import { Input, Select, Checkbox } from "../../components/ui/Fields";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { Modal, ConfirmationDialog } from "../../components/ui/Overlays";
import { ErrorState, LoadingSkeleton } from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { useWorkspace } from "../../hooks/useWorkspace";
import { teamService } from "../../services/teamService";
import type { TeamMember } from "../../types";
import "../../styles/phase-four.css";
const permissions = [
  ["view-transactions", "View Transactions"],
  ["create-transactions", "Create Transactions"],
  ["manage-parties", "Manage Parties"],
  ["view-reports", "View Reports"],
  ["manage-settings", "Manage Settings"],
] as const;
const schema = z.object({
  name: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["Staff", "Accountant", "Manager"]),
  permissions: z.array(z.string()).min(1, "Select at least one permission"),
});
type Form = z.infer<typeof schema>;
export function TeamPage() {
  const business = useWorkspace(),
    client = useQueryClient(),
    notify = useToast();
  const [open, setOpen] = useState(false),
    [remove, setRemove] = useState<TeamMember | null>(null);
  const query = useQuery({
    queryKey: ["team", business],
    queryFn: () => teamService.list(business),
  });
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      role: "Staff",
      permissions: [
        "view-transactions",
        "create-transactions",
        "manage-parties",
      ],
    },
  });
  const invite = useMutation({
    mutationFn: (v: Form) => teamService.invite(business, v),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["team", business] });
      setOpen(false);
      form.reset();
      notify("Team invitation created. Email delivery is not enabled yet.");
    },
  });
  const deletion = useMutation({
    mutationFn: (id: string) => teamService.remove(business, id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["team", business] });
      setRemove(null);
      notify("Team member removed.");
    },
  });
  return (
    <div className="page-stack team-page">
      <PageHeader
        title="Team Members"
        subtitle="Manage your organization's members, roles, and resource access levels."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={14} />
            Invite Member
          </Button>
        }
      />
      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <Table aria-label="Team members">
          <TableHeader>
            <TableRow>
              {[
                "Name",
                "Email",
                "Role",
                "Status",
                "Last Active",
                "Actions",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {query.data?.map((m) => (
              <TableRow key={m.id}>
                <th scope="row">{m.name}</th>
                <td>{m.email}</td>
                <td>{m.role}</td>
                <td>
                  <Badge
                    tone={
                      m.status === "Active"
                        ? "success"
                        : m.status === "Invited"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {m.status}
                  </Badge>
                </td>
                <td>{m.lastActive}</td>
                <td>
                  {m.role === "Owner" ? (
                    "—"
                  ) : (
                    <>
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() =>
                          notify(
                            m.status === "Invited"
                              ? "Invitation resent."
                              : "Member editing is scheduled for a later phase.",
                          )
                        }
                      >
                        {m.status === "Invited" ? "Resend" : "Edit"}
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() => setRemove(m)}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Invite Team Member"
        className="team-modal"
      >
        <form onSubmit={form.handleSubmit((v) => invite.mutate(v))}>
          <Input
            label="Full Name"
            {...form.register("name")}
            error={form.formState.errors.name?.message}
          />
          <Input
            label="Email Address"
            {...form.register("email")}
            error={form.formState.errors.email?.message}
          />
          <Select label="Select Role" {...form.register("role")}>
            <option>Staff</option>
            <option>Accountant</option>
            <option>Manager</option>
          </Select>
          <fieldset>
            <legend>Permissions</legend>
            {permissions.map(([value, label]) => (
              <Checkbox
                key={value}
                label={label}
                value={value}
                {...form.register("permissions")}
              />
            ))}
          </fieldset>
          {form.formState.errors.permissions && (
            <span role="alert" className="field-error">
              {form.formState.errors.permissions.message}
            </span>
          )}
          {invite.error && (
            <span role="alert" className="field-error">
              {invite.error.message}
            </span>
          )}
          <div className="dialog-actions">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={invite.isPending}>
              Send Invite
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmationDialog
        open={!!remove}
        onOpenChange={(v) => !v && setRemove(null)}
        title="Remove team member?"
        description={`Remove ${remove?.name || "this member"} from the workspace?`}
        onConfirm={() => remove && deletion.mutate(remove.id)}
        loading={deletion.isPending}
      />
    </div>
  );
}
