import type { ReactNode } from "react"

// Small shared pieces for the scenario screens, in the tool's existing palette.

export type Tone = "green" | "amber" | "blue" | "red" | "grey"

const TONES: Record<Tone, string> = {
  green: "bg-[#E3F4E9] text-[#00703a]",
  amber: "bg-[#FBEFD8] text-[#7a5212]",
  blue: "bg-[#E8F3F9] text-[#00508a]",
  red: "bg-[#F6DCDF] text-[#a8172f]",
  grey: "bg-[#EFEBE8] text-[#5f5d5d]",
}

export function Tag({ tone = "grey", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center h-5 px-2 rounded-full text-[11.5px] font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  )
}


export function Panel({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="bg-white rounded-lg border border-[#E6E1DD] shadow-sm p-4 flex flex-col gap-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-bold text-[#484747] m-0">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function SubHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <h3 className="text-[15px] font-semibold text-[#484747] m-0">{children}</h3>
      {aside}
    </div>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-5 text-[#6b6969] m-0">{children}</p>
}

export interface SegmentOption<T extends string> {
  id: T
  label: string
  disabled?: boolean
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.id)}
            className={`min-h-8 px-3 rounded-md text-[13px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              on ? "bg-[#484747] border-[#484747] text-white" : "bg-white border-[#D7D2CD] text-[#484747] hover:bg-[#F5F2EF]"
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function SmallButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "ghost"
  disabled?: boolean
  title?: string
}) {
  const look =
    variant === "primary"
      ? "bg-[#E12747] text-white border-[#E12747] hover:opacity-90"
      : variant === "ghost"
        ? "bg-transparent text-[#00508a] border-transparent hover:bg-[#F5FAFC]"
        : "bg-white text-[#484747] border-[#484747] hover:bg-[#eae5e2]"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-h-9 px-3 rounded-md border text-[13.5px] font-semibold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${look}`}
    >
      {children}
    </button>
  )
}
