import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Toast as RadixToast } from "radix-ui";
import { X } from "lucide-react";
interface ToastMessage {
  id: string;
  message: string;
  tone: "success" | "info" | "error";
}
const Context = createContext<
  (message: string, tone?: ToastMessage["tone"]) => void
>(() => undefined);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const notify = useCallback(
    (message: string, tone: ToastMessage["tone"] = "info") =>
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), message, tone },
      ]),
    [],
  );
  return (
    <Context.Provider value={notify}>
      <RadixToast.Provider duration={5000}>
        {children}
        {messages.map((message) => (
          <RadixToast.Root
            key={message.id}
            className={`toast toast--${message.tone}`}
            onOpenChange={(open) => {
              if (!open)
                setMessages((current) =>
                  current.filter((m) => m.id !== message.id),
                );
            }}
          >
            <RadixToast.Description>{message.message}</RadixToast.Description>
            <RadixToast.Close aria-label="Dismiss notification">
              <X size={16} />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="toast-viewport" />
      </RadixToast.Provider>
    </Context.Provider>
  );
}
export const useToast = () => useContext(Context);
export { RadixToast as Toast };
