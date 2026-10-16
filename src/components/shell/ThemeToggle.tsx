"use client";

import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tooltip";

const THEME_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeItems() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <DropdownMenuItem
          key={value}
          role="menuitemradio"
          aria-checked={theme === value}
          onSelect={() => setTheme(value)}
        >
          <Icon />
          <span className="flex-1">{label}</span>
          {theme === value && <Check className="!text-text" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function ThemeToggle() {
  return (
    <DropdownMenu>
      <Tip label="Theme">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Change theme">
            {/* Class-driven so the server render needs no theme. */}
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="min-w-36">
        <ThemeItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
