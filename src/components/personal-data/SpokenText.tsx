import type { TextWithSpoken } from './model';

/** Draws `text` (for example "2,300–2,600 kcal") but lets screen readers hear "2,300 to 2,600 kcal". */
export const SpokenText = ({ value }: { value: TextWithSpoken }) =>
  value.text === value.spoken ? (
    <>{value.text}</>
  ) : (
    <>
      <span aria-hidden="true">{value.text}</span>
      <span className="sr-only">{value.spoken}</span>
    </>
  );
