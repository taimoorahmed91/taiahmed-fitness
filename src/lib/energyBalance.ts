// ~7,700 kcal of net energy balance corresponds to roughly 1 kg of body mass.
export const KCAL_PER_KG = 7700;

export interface EnergyDay {
  consumed: number;
  burned: number;
}

/** Sums burned − consumed over days with both values; positive = deficit. */
export const projectMassChange = (days: EnergyDay[]) => {
  const valid = days.filter((d) => d.burned > 0 && d.consumed > 0);
  const deficit = valid.reduce((s, d) => s + (d.burned - d.consumed), 0);
  return { days: valid.length, deficit, kg: -deficit / KCAL_PER_KG };
};
