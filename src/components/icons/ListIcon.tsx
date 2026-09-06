import { Icon, type IconProps } from "./Icon";

export function ListIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <circle cx="3.5" cy="6" r="1.5" />
      <rect x="8" y="4.75" width="12.5" height="2.5" rx="1.25" />
      <circle cx="3.5" cy="12" r="1.5" />
      <rect x="8" y="10.75" width="12.5" height="2.5" rx="1.25" />
      <circle cx="3.5" cy="18" r="1.5" />
      <rect x="8" y="16.75" width="12.5" height="2.5" rx="1.25" />
    </Icon>
  );
}
