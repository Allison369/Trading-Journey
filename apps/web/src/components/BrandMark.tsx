import { BRAND_GLYPH_PATH, BRAND_TILE_PATH } from "../brand-mark-path";

/**
 * The TradeVault mark: an ink tile with the chart glyph cut out in cream.
 *
 * The colours are fixed rather than themed. The mark is meant to look the same
 * on cream paper, on the dark sidebar and on the violet accent, and a themed
 * version would either lose the glyph on dark or change the brand.
 */
export function BrandMark({
  size = 34,
  label = "TradeVault",
}: {
  size?: number;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      role="img"
      aria-label={label}
      focusable="false"
    >
      <path d={BRAND_TILE_PATH} fill="#141412" />
      <path d={BRAND_GLYPH_PATH} fill="#FAFBF8" fillRule="evenodd" />
    </svg>
  );
}
