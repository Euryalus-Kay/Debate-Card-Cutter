"use client";

interface IconProps {
  className?: string;
  strokeWidth?: number;
  size?: number;
}

const base = (size = 16): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  fill: "none",
  stroke: "currentColor",
  viewBox: "0 0 24 24",
});

export function ScissorsIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

export function ShieldIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function FlameIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

export function GavelIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M14 13l-6 6M3 21h7M14.5 7.5l4 4M11 5l8 8M7 9l8 8" />
    </svg>
  );
}

export function ClockIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function BrainIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z" />
    </svg>
  );
}

export function SparkleIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M12 2l1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4L12 2z" />
      <path d="M5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14z" />
      <path d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14z" />
    </svg>
  );
}

export function ChartIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-5" />
    </svg>
  );
}

export function BookIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

export function FlagIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

export function MicIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

export function TargetIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function PlayIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export function PauseIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

export function ResetIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

export function ScalesIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M12 2v20" />
      <path d="M5 6h14" />
      <path d="M3 14a4 4 0 0 0 8 0L7 6" />
      <path d="M13 14a4 4 0 0 0 8 0l-4-8" />
    </svg>
  );
}

export function LayersIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

export function ZapIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function SearchIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function ToolboxIcon({ className = "", strokeWidth = 1.5, size }: IconProps) {
  return (
    <svg {...base(size || 16)} className={className} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
      <path d="M22 12h-2.5l-1-2H10.5l-1 2H7" />
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
