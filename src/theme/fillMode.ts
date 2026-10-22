/**
 * How a filled brand button is painted (Oct 22, owner picked "Do soft" after
 * "Maybe the gradient on the button is making it look ai"): one solid fill in
 * the court's own colour, a barely-there lighter top edge (BrandWash) and the
 * small plain shadow below. No gradient, no glow in the button's own colour.
 * The same on every platform and on dark pages.
 */

/** The small plain shadow a filled brand button sits on. */
export const brandShadow = {
  shadowColor: '#000000',
  shadowOpacity: 0.1,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

/** brandShadow as a CSS-style `boxShadow`. */
export const brandBoxShadow = '0px 1px 2px rgba(0, 0, 0, 0.1)';
