"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import { cn } from "@/lib/cn";

export const Slider = forwardRef<
  ElementRef<typeof SliderPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    thumbLabel?: string;
  }
>(({ className, thumbLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-5 w-full touch-none select-none items-center",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-surface-3">
      <SliderPrimitive.Range className="absolute h-full bg-accent-ink" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={thumbLabel}
      className="block size-3.5 rounded-full border border-accent-ink bg-surface-1 shadow-raised transition-transform duration-fast ease-out hover:scale-110 focus-visible:scale-110"
    />
  </SliderPrimitive.Root>
));
Slider.displayName = "Slider";
