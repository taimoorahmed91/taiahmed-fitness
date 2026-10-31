import * as React from "react";
import { MoreHorizontal } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

export interface RowAction {
  /** Stable key. */
  key: string;
  /** Visible in the menu, and the accessible name / tooltip of the inline icon button. */
  label: string;
  /** Icon element, e.g. `<Pencil />`. Decorative: hidden from screen readers. */
  icon?: React.ReactNode;
  onSelect: () => void;
  /** Red styling. The handler should open a confirmation (e.g. ConfirmDeleteButton / AlertDialog), not delete directly. */
  destructive?: boolean;
  disabled?: boolean;
  /** Shows a spinner and blocks repeat clicks. */
  loading?: boolean;
  /** Skip this action without rebuilding the array. */
  hidden?: boolean;
}

export interface RowActionsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Names the whole group, e.g. "Actions for Bench press". Also used as the "more" button name. */
  label: string;
  actions: RowAction[];
  /**
   * - "responsive" (default): inline icon buttons from `sm` up, one "more" menu on phones.
   * - "inline": always icon buttons.
   * - "menu": always the menu.
   */
  display?: "responsive" | "inline" | "menu";
  /**
   * Always-visible control rendered after the actions, never collapsed into the menu.
   * Use it for things that need their own dialog, like a ConfirmDeleteButton.
   */
  trailing?: React.ReactNode;
}

const INLINE_ONLY = "hidden sm:flex";
const MENU_ONLY = "sm:hidden";

function InlineActions({ label, actions, className }: { label: string; actions: RowAction[]; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("items-center gap-1", className ?? "flex")}>
      {actions.map((action) => (
        <IconButton
          key={action.key}
          label={action.label}
          tooltip
          size="sm"
          loading={action.loading}
          disabled={action.disabled}
          onClick={action.onSelect}
          className={cn(action.destructive && "text-destructive hover:text-destructive")}
        >
          {action.icon}
        </IconButton>
      ))}
    </div>
  );
}

function MenuActions({ label, actions, className }: { label: string; actions: RowAction[]; className?: string }) {
  // modal={false}: lets an action open a Dialog/AlertDialog without Radix leaving the page un-clickable.
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <IconButton label={label} size="sm" className={className}>
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.key}
            disabled={action.disabled || action.loading}
            onSelect={() => action.onSelect()}
            className={cn(
              "gap-2 [@media(pointer:coarse)]:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0",
              action.destructive && "text-destructive focus:text-destructive",
            )}
          >
            {action.icon ? <span aria-hidden="true" className="contents">{action.icon}</span> : null}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The edit / duplicate / delete cluster at the end of a list row.
 * Same actions everywhere, collapses to a "more" menu on phones so rows don't get crowded.
 */
function RowActions({ label, actions, display = "responsive", trailing, className, ...props }: RowActionsProps) {
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0 && !trailing) return null;

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)} {...props}>
      {visible.length > 0 && display === "inline" && <InlineActions label={label} actions={visible} />}
      {visible.length > 0 && display === "menu" && <MenuActions label={label} actions={visible} />}
      {visible.length > 0 && display === "responsive" && (
        <>
          <InlineActions label={label} actions={visible} className={INLINE_ONLY} />
          <MenuActions label={label} actions={visible} className={MENU_ONLY} />
        </>
      )}
      {trailing}
    </div>
  );
}

export { RowActions };
