import type { ReactNode, SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill" | "children"> & {
  size?: number;
};

// Shared shell every icon renders through, so a size prop reliably controls
// both width and height in one place instead of each icon wiring that up
// itself.
export function Icon({
  viewBox,
  size = 24,
  children,
  ...props
}: IconProps & { viewBox: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}
