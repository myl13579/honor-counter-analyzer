# -*- coding: utf-8 -*-
"""一次性抓取王者荣耀官网英雄/装备/召唤师技能数据，落盘 data/knowledge/*.json。

数据源（构建期执行，运行期不依赖外网）：
  - 英雄: https://pvp.qq.com/web201605/js/herolist.json
  - 装备: https://pvp.qq.com/web201605/js/item.json
  - 召唤师技能: https://pvp.qq.com/web201605/js/summoner.json
"""
import json
import os
import urllib.request

BASE = "https://pvp.qq.com/web201605/js"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "knowledge")


def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    heroes = fetch(f"{BASE}/herolist.json")
    items = fetch(f"{BASE}/item.json")
    summoners = fetch(f"{BASE}/summoner.json")

    # 保存原始抓取结果
    with open(os.path.join(OUT_DIR, "heroes_raw.json"), "w", encoding="utf-8") as f:
        json.dump(heroes, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT_DIR, "items.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT_DIR, "summoners.json"), "w", encoding="utf-8") as f:
        json.dump(summoners, f, ensure_ascii=False, indent=2)

    # 统计 hero_type / roles 分布，用于确定定位映射
    type_dist = {}
    role_dist = {}
    for h in heroes:
        type_dist[h.get("hero_type")] = type_dist.get(h.get("hero_type"), 0) + 1
        for r in str(h.get("roles", "")).split("|"):
            if r:
                role_dist[r] = role_dist.get(r, 0) + 1

    print(f"英雄数: {len(heroes)}")
    print(f"装备数: {len(items)}")
    print(f"召唤师技能数: {len(summoners)}")
    print(f"hero_type 分布: {dict(sorted(type_dist.items()))}")
    print(f"roles 分布: {dict(sorted(role_dist.items()))}")

    # 打印若干样例，确认字段含义
    print("\n样例英雄(hero_type -> cname):")
    for h in heroes[:15]:
        print(f"  ename={h['ename']} cname={h['cname']} hero_type={h.get('hero_type')} roles={h.get('roles')}")


if __name__ == "__main__":
    main()
