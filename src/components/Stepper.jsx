const STEPS = ["Choose photos", "Name the faces", "Save to folders"];

export default function Stepper({ current, done }) {
  return (
    <ol className="stepper">
      {STEPS.map((label, i) => {
        const state = done || i < current ? "complete" : i === current ? "current" : "upcoming";
        return (
          <li key={label} className={`step-item ${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-dot">{state === "complete" ? "✓" : i + 1}</span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
