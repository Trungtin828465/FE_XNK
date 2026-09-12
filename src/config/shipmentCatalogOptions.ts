export const DESTINATION_PORT_OPTIONS = ["HCM", "HP"] as const;

export function isDestinationPort(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return DESTINATION_PORT_OPTIONS.some((port) => port === normalized);
}
