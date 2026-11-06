/** A mosque in Lucide's line style (Lucide has none): the rail's Prayer button. */
export function MosqueIcon({ size = 24, strokeWidth = 2 }: { size?: number | string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5v3" />
      <path d="M6.5 20v-5.5a5.5 5.5 0 0 1 11 0V20" />
      <path d="M3 20v-9.5L4 8l1 2.5V20M19 20v-9.5L20 8l1 2.5V20" />
      <path d="M10.2 20v-2.6a1.8 1.8 0 0 1 3.6 0V20" />
      <path d="M2 20.5h20" />
    </svg>
  );
}
