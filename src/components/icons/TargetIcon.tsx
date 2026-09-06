import { Icon, type IconProps } from "./Icon";

export function TargetIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"
      />
      <circle cx="12" cy="12" r="2.5" />
    </Icon>
  );
}
