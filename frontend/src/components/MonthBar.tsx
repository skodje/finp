import { monthLabel } from '../format';

type Props = {
  months: string[]; // newest first
  current: string;
  onChange: (month: string) => void;
};

export function MonthBar({ months, current, onChange }: Props) {
  const index = months.indexOf(current);

  return (
    <section className="monthbar">
      <button
        type="button"
        aria-label="Forrige måned"
        onClick={() => index >= 0 && index < months.length - 1 && onChange(months[index + 1])}
      >
        ‹
      </button>

      <select
        id="month-select"
        name="month"
        value={current}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Velg måned"
      >
        {(months.length ? months : [current]).map((month) => (
          <option key={month} value={month}>
            {monthLabel(month)}
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-label="Neste måned"
        onClick={() => index > 0 && onChange(months[index - 1])}
      >
        ›
      </button>
    </section>
  );
}
