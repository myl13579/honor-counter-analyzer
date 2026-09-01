import { useState } from 'react';
import { Input } from 'tdesign-react';
import { SearchIcon } from 'tdesign-icons-react';
import { TYPE_ORDER, type Hero } from '../types';
import HeroAvatar from './HeroAvatar';

interface Props {
  byType: Record<string, Hero[]>;
  selected: string[];
  onToggle: (name: string) => void;
}

export default function HeroSelector({ byType, selected, onToggle }: Props) {
  const [keyword, setKeyword] = useState('');
  const [activeType, setActiveType] = useState(TYPE_ORDER[0]);
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

  const renderCard = (h: Hero) => {
    const active = selected.includes(h.name);
    const disabled = !active && maxReached;
    return (
      <div
        key={h.ename}
        className={`hero-card ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => {
          if (disabled) return;
          onToggle(h.name);
        }}
        title={h.title ? `${h.name}·${h.title}` : h.name}
      >
        <HeroAvatar ename={h.ename} name={h.name} type={h.type_name} size="sm" />
        <span className="hero-card-name">{h.name}</span>
        {active && <span className="hero-check">✓</span>}
      </div>
    );
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
            <div className="hero-grid">{matched.map(renderCard)}</div>
          ) : (
            <div className="search-empty">未找到匹配英雄</div>
          )}
        </div>
      ) : (
        <>
          <div className="type-tabs">
            {TYPE_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                className={`type-tab ${activeType === t ? 'active' : ''}`}
                onClick={() => setActiveType(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="hero-grid">{(byType[activeType] || []).map(renderCard)}</div>
        </>
      )}
    </div>
  );
}
