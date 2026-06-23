import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, BookOpen, Package, Users, Truck, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DESPACHO_NOMBRE } from "@/lib/supabase";

const items = [
  { to: "/", label: "Proyectos", icon: Home },
  { to: "/catalogo", label: "Catálogo", icon: BookOpen },
  { to: "/materiales", label: "Materiales", icon: Package },
  { to: "/personal", label: "Personal", icon: Users },
  { to: "/proveedores", label: "Proveedores", icon: Truck },
] as const;

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 md:hidden" aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle className="text-left">{DESPACHO_NOMBRE}</SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium hover:bg-accent"
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              {label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}