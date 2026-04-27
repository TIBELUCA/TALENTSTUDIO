interface CircleProgressProps {
  percent: number;
  label?: string;
  sublabel?: string;
  centerText?: string;
  size?: number;
  strokeWidth?: number;
  overdue?: boolean;
}

export function CircleProgress({ percent, label, sublabel, centerText, size = 120, strokeWidth = 8, overdue = false }: CircleProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (clampedPercent / 100) * circumference;

  const color = overdue
    ? "stroke-red-500"
    : percent >= 100
    ? "stroke-green-500"
    : percent > 0
    ? "stroke-green-500"
    : "stroke-muted-foreground/20";

  const textColor = overdue
    ? "text-red-600 dark:text-red-400"
    : percent >= 100
    ? "text-green-600 dark:text-green-400"
    : "text-foreground";

  return (
    <div className="flex flex-col items-center gap-1" data-testid={`circle-progress-${(label || "").toLowerCase().replace(/\s/g, "-")}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-muted-foreground/10"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`${color} transition-all duration-700 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerText ? (
            <div className={`flex flex-col items-center leading-none ${textColor}`}>
              {centerText.split("/").map((part, i) => (
                <span key={i} className="text-[18px] font-extrabold">
                  {i === 1 ? ["GEN","FEB","MAR","APR","MAG","GIU","LUG","AGO","SET","OTT","NOV","DIC"][parseInt(part, 10) - 1] || part : part}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-foreground text-[25px] font-extrabold">
              {Math.round(percent)}%
            </span>
          )}
        </div>
      </div>
      {label && <span className="text-xs font-semibold text-foreground">{label}</span>}
      {sublabel && <span className="text-[10px] text-muted-foreground leading-tight text-center">{sublabel}</span>}
    </div>
  );
}
