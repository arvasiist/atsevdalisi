'use client';

/**
 * Sekme çubuğu (01.10.2026 tasarım yenilemesi). Uzun sayfaları (örn.
 * Yarışlar: lobi + pratik yarış alt alta) bölmek için. Erişilebilirlik:
 * `role="tablist"`/`"tab"` + `aria-selected`; içerik paneli çağıranın
 * sorumluluğundadır (`role="tabpanel"`).
 */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
}): React.ReactElement {
  return (
    <div role="tablist" aria-label={label} className="tabs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={item.id === value}
          aria-controls={`tabpanel-${item.id}`}
          className="tab"
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
