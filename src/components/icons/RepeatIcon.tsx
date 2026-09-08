import { Icon, type IconProps } from "./Icon";

export function RepeatIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
      />
    </Icon>
  );
}
