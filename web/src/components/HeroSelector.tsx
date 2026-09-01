import { useState } from 'react';
import { Tabs, Input } from 'tdesign-react';
import { SearchIcon } from 'tdesign-icons-react';
import { TYPE_ORDER, TYPE_COLORS, type Hero } from '../types';

interface Props {
  byType: Record<string, Hero[]>;
  selected: string[];
  onToggle: (name: string) => void;
}

export default function HeroSelector({ byType, selected, onToggle }: Props) {
  const [keyword, setKeyword] = useState('');
  const maxReached = selected.length >= 5;

  const kw = keyword.trim().toLowerCase();
  const allHeroes = TYPE_ORDER.flatMap((t) => byType[t] || []);
  const matched = kw
    ? allHeroes.filter(
        (h) =>
          h.name.toLowerCase().includes(kw) ||
          (h.title || '').toLowerCase().includes(kw)
      )
    : [];

  const renderChip = (h: Hero) => {
    const active = selected.includes(h.name);
    const disabled = !active && maxReached;
    const color = TYPE_COLORS[h.type_name] || '#999';
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
  };

  const renderGroup = (type: string) => {
    const list = byType[type] || [];
    return <div className="hero-grid">{list.map(renderChip)}</div>;
  };

  return (
    <div className="hero-selector">
      <Input
        className="hero-search"
        value={keyword}
        onChange={(v) => setKeyword(v as string)}
        clearable
        prefixIcon={<SearchIcon />}
        placeholder="搜索英雄名快速定位"
      />
      {kw ? (
        <div className="hero-search-result">
          {matched.length ? (
            <div className="hero-grid">{matched.map(renderChip)}</div>
          ) : (
            <div className="search-empty">未找到匹配英雄</div>
          )}
        </div>
      ) : (
        <Tabs defaultValue={TYPE_ORDER[0]} size="medium">
          {TYPE_ORDER.map((t) => (
            <Tabs.TabPanel key={t} value={t} label={`${t}(${(byType[t] || []).length})`}>
              {renderGroup(t)}
            </Tabs.TabPanel>
          ))}
        </Tabs>
      )}
    </div>
  );
}
