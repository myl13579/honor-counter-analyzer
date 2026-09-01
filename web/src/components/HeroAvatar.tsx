import { useState } from 'react';
import { TYPE_COLORS } from '../types';

interface Props {
  ename: number;
  name: string;
  type: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 英雄头像：优先加载官网 CDN 头像，失败时降级为「首字 + 定位主题色」色块。
 * 头像 CDN：https://game.gtimg.cn/images/yxzj/img201606/heroimg/{ename}/{ename}.jpg
 */
export default function HeroAvatar({ ename, name, type, size = 'md' }: Props) {
  const [err, setErr] = useState(false);
  const color = TYPE_COLORS[type] || '#999';
  const src = `https://game.gtimg.cn/images/yxzj/img201606/heroimg/${ename}/${ename}.jpg`;

  return (
    <div
      className={`hero-avatar ${size}`}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}55)` }}
    >
      {err ? (
        <span className="avatar-fallback">{name.charAt(0)}</span>
      ) : (
        <img src={src} alt={name} loading="lazy" onError={() => setErr(true)} />
      )}
    </div>
  );
}
