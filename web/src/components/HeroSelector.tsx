import { Tabs } from 'tdesign-react';
import { TYPE_ORDER, TYPE_COLORS, type Hero } from '../types';

interface Props {
  byType: Record<string, Hero[]>;
  selected: string[];
  onToggle: (name: string) => void;
}

export default function HeroSelector({ byType, selected, onToggle }: Props) {
  const maxReached = selected.length >= 5;

  const renderGroup = (type: string) => {
    const list = byType[type] || [];
    const color = TYPE_COLORS[type] || '#999';
    return (
      <div className="hero-grid">
        {list.map((h) => {
          const active = selected.includes(h.name);
          const disabled = !active && maxReached;
          return (
            <div
              key={h.ename}
              className={`hero-chip ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
              style={active ? { borderColor: color, color } : undefined}
              onClick={() => {
                if (disabled) return;
                onToggle(h.name);
              }}
              title={h.title ? `${h.name}·${h.title}` : h.name}
            >
              {h.name}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="hero-selector">
      <Tabs defaultValue={TYPE_ORDER[0]} size="medium">
        {TYPE_ORDER.map((t) => (
          <Tabs.TabPanel key={t} value={t} label={`${t}(${(byType[t] || []).length})`}>
            {renderGroup(t)}
          </Tabs.TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
