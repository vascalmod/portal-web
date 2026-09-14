import { Toaster as Sonner } from "sonner"

export function Toaster() {
  return <Sonner position="bottom-center" richColors closeButton toastOptions={{ duration: 3500 }} />;
}
