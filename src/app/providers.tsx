/**
 * Punto único para envoltorios de cliente (contextos, temas…).
 * Ahora mismo no hay ninguno: el estado del servidor se resuelve con Server
 * Components y Server Actions, sin librería de data-fetching en el cliente.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
