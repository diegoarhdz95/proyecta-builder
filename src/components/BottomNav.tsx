import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Plus, Receipt } from "lucide-react";
import { QuickGastoSheet } from "./QuickGastoSheet";

export function BottomNav() {
  const [openGasto, setOpenGasto] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const obraIdMatch = pathname.match(/^\/proyectos\/([^/]+)/);
  const obraId = obraIdMatch?.[1];

  const isHome = pathname === "/";

  return (
    <>
      <nav
        aria-label="Navegación inferior"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Link
          to="/"
          className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium ${
            isHome ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <Home className="h-5 w-5" />
          Inicio
        </Link>
        <button
          type="button"
          onClick={() => setOpenGasto(true)}
          className="relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium text-foreground"
        >
          <span className="-mt-6 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Receipt className="h-5 w-5" />
          </span>
          <span className="-mt-1">Gasto</span>
        </button>
        <Link
          to="/proyectos/nuevo"
          className="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground"
        >
          <Plus className="h-5 w-5" />
          Nuevo
        </Link>
      </nav>

      <QuickGastoSheet open={openGasto} onOpenChange={setOpenGasto} obraId={obraId} />
    </>
  );
}