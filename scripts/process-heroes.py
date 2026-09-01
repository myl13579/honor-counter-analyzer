# -*- coding: utf-8 -*-
"""将 heroes_raw.json 规范化为 heroes.json，附带定位中文名映射。"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
KNOW = os.path.join(HERE, "..", "data", "knowledge")

TYPE_MAP = {1: "战士", 2: "法师", 3: "坦克", 4: "刺客", 5: "射手", 6: "辅助"}


def main():
    with open(os.path.join(KNOW, "heroes_raw.json"), encoding="utf-8") as f:
        raw = json.load(f)

    # 元流之子系列：官网 hero_type 有误，按名称后缀强制映射
    FIX = {
        "元流之子(法师)": "法师", "元流之子(坦克)": "坦克", "元流之子(射手)": "射手",
        "元流之子(刺客)": "刺客", "元流之子(辅助)": "辅助",
    }
    REVERSE_TYPE = {v: k for k, v in TYPE_MAP.items()}

    heroes = []
    for h in raw:
        name = h["cname"]
        tname = FIX.get(name) or TYPE_MAP.get(h.get("hero_type", 0), "未知")
        heroes.append({
            "ename": h["ename"],
            "name": name,
            "title": h.get("title", ""),
            "hero_type": REVERSE_TYPE.get(tname, h.get("hero_type", 0)),
            "type_name": tname,
        })

    heroes.sort(key=lambda x: (x["hero_type"], x["ename"]))
    with open(os.path.join(KNOW, "heroes.json"), "w", encoding="utf-8") as f:
        json.dump(heroes, f, ensure_ascii=False, indent=2)

    # 按定位分组打印完整名单
    by_type = {}
    for h in heroes:
        by_type.setdefault(h["type_name"], []).append(h["name"])

    print(f"规范化英雄数: {len(heroes)}\n")
    for t in ["战士", "法师", "坦克", "刺客", "射手", "辅助"]:
        names = by_type.get(t, [])
        print(f"【{t}】({len(names)}人): {', '.join(names)}\n")


if __name__ == "__main__":
    main()
