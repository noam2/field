type Option<T extends string> = { value: T; label: string }

type Props<T extends string> = {
  name: string
  value: T | null
  options: Option<T>[]
  onChange: (value: T) => void
  legend: string
}

export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  legend,
}: Props<T>) {
  return (
    <fieldset className="seg">
      <legend className="label">{legend}</legend>
      <div className="seg-row" role="radiogroup" aria-label={legend}>
        {options.map((opt) => {
          const checked = value === opt.value
          return (
            <label key={opt.value} className={checked ? 'seg-opt is-on' : 'seg-opt'}>
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                onChange={() => onChange(opt.value)}
              />
              {opt.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
