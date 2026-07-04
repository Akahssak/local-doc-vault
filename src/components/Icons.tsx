import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export const UploadIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 16V4m0 0 4 4m-4-4L8 8" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
);

export const LockIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="4.5" y="10" width="15" height="10" rx="2.2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15" r="1.4" />
  </svg>
);

export const ShieldIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 3 5 6v5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6l-7-3Z" />
    <path d="m9.5 12 1.8 1.8L15 10" />
  </svg>
);

export const TrashIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
  </svg>
);

export const FileIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5" />
  </svg>
);

export const SettingsIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.4A1.7 1.7 0 0 0 10.5 3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9.4a1.7 1.7 0 0 0 1.6 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const DownloadIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 4v10m0 0 4-4m-4 4-4-4" />
    <path d="M5 19h14" />
  </svg>
);

export const EyeIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const CodeIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="m8 8-4 4 4 4m8-8 4 4-4 4M13.5 6l-3 12" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="m5 12 4.5 4.5L19 7" />
  </svg>
);

export const PencilIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" />
    <path d="M13.5 6.5l3 3" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const SpinnerIcon = (p: IconProps) => (
  <svg {...base} {...p} className={`animate-spin ${p.className ?? ''}`}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export const MenuIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const AlertIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 9v4m0 4h.01M10.3 4l-7.5 13A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z" />
  </svg>
);

export const TagIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 8.5V4a1 1 0 0 1 1-1h4.5a1 1 0 0 1 .7.3l10 10a1 1 0 0 1 0 1.4l-4.5 4.5a1 1 0 0 1-1.4 0l-10-10a1 1 0 0 1-.3-.7Z" />
    <circle cx="7" cy="7" r="1.3" />
  </svg>
);

export const FolderIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
);

export const FilterIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" />
  </svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const SortIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />
  </svg>
);

export const DatabaseIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <ellipse cx="12" cy="5.5" rx="8" ry="3" />
    <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </svg>
);

export const RefreshIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 4v5h5M20 20v-5h-5" />
    <path d="M20 9a8 8 0 0 0-14-3L4 9m16 6a8 8 0 0 1-14 3l-2-3" />
  </svg>
);

export const ChartBarIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 20V10m5 10V4m5 16v-7m5 7V8" />
  </svg>
);

export const TableIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
  </svg>
);

export const GridIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

export const RupeeIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M7 4h10M7 8h10M16 4c0 4-3.5 6-8 6h1l7 6" />
  </svg>
);

export const TrendingUpIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 17l6-6 4 4 7-8" />
    <path d="M17 7h4v4" />
  </svg>
);

export const LayersIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="m3 13 9 5 9-5M3 18l9 5 9-5" />
  </svg>
);

export const HashIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M5 9h14M5 15h14M9 4 7 20M17 4l-2 16" />
  </svg>
);

export const SigmaIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M17 5H7l6 7-6 7h10" />
  </svg>
);

export const PercentIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M19 5 5 19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);

export const SunIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);

export const MonitorIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);

