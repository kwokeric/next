import { Icon, type IconProps } from "./Icon";

export function DragHandleIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <circle cx="8" cy="6" r="1.6" />
      <circle cx="16" cy="6" r="1.6" />
      <circle cx="8" cy="12" r="1.6" />
      <circle cx="16" cy="12" r="1.6" />
      <circle cx="8" cy="18" r="1.6" />
      <circle cx="16" cy="18" r="1.6" />
    </Icon>
  );
}
