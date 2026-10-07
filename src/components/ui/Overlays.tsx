import { Dialog, DropdownMenu } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className={`modal ${className}`}>
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Close">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="modal-description">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Drawer(props: ModalProps) {
  return <Modal {...props} className={`drawer ${props.className || ""}`} />;
}
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  loading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="confirm-dialog"
    >
      <div className="dialog-actions">
        <Button onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>
          Delete
        </Button>
      </div>
    </Modal>
  );
}
export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}
export function Dropdown({
  trigger,
  items,
  label,
}: {
  trigger: ReactNode;
  items: MenuItem[];
  label: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" aria-label={label} className="menu-trigger">
          {trigger}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="dropdown" sideOffset={6} align="end">
          {items.map((item, i) => (
            <DropdownMenu.Item
              key={i}
              className={item.danger ? "danger-text" : ""}
              onSelect={item.onSelect}
              disabled={item.disabled}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
