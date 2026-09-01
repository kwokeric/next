import { Icon, type IconProps } from "./Icon";

export function TrashIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" {...props}>
      <path
        d="M3 4 H13 M6 4 V2.5 H10 V4 M4.5 4 L5.2 13 A1 1 0 0 0 6.2 14 H9.8 A1 1 0 0 0 10.8 13 L11.5 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}
