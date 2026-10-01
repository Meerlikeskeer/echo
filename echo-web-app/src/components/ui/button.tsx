import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn/ui Button (Radix variant), styled for Echo's quiet recording workspace.
const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0", {
  variants: {
    variant: {
      default: "bg-[#344638] text-white hover:bg-[#243329]",
      outline: "border border-[#d9dcd2] bg-transparent hover:bg-[#eeefe7]",
      ghost: "hover:bg-[#e9ece2]",
    },
    size: { default: "h-11 px-4", sm: "h-9 px-3", icon: "size-10" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={twMerge(clsx(buttonVariants({ variant, size }), className))} {...props} />;
}
