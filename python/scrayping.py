"""Module providing a function printing python version."""

import json
import re
import time
import argparse
from pathlib import Path
from typing import Dict, Optional, List, Tuple
from tqdm import tqdm
import requests
from bs4 import BeautifulSoup


class EndfieldScraper:
    """URLを固定して必要なデータをget_xxx形式で取得するスクレイパー。"""

    def __init__(self, url: str) -> None:
        """スクレイプ対象URLを受け取り、キャッシュを初期化する。"""
        self.url = url
        self._soup: Optional[BeautifulSoup] = None
        self._jp_to_key_map: Optional[Dict[str, str]] = None

    def _fetch_soup(self, force_refresh: bool = False) -> BeautifulSoup:
        """対象ページを取得し、BeautifulSoupをキャッシュ付きで返す。"""
        if self._soup is not None and not force_refresh:
            return self._soup

        response = requests.get(self.url, timeout=20)
        response.encoding = response.apparent_encoding  # 文字化け対策
        response.raise_for_status()

        self._soup = BeautifulSoup(response.text, "html.parser")
        return self._soup

    def _get_jp_to_key_map(self) -> Dict[str, str]:
        """`trans.json` を読み込み、日本語名→内部キーの辞書を返す。"""
        if self._jp_to_key_map is not None:
            return self._jp_to_key_map
        trans_path = Path(__file__).resolve().parent.parent / "trans.json"
        with open(trans_path, "r", encoding="utf-8") as f:
            key_to_jp = json.load(f)
        self._jp_to_key_map = {jp: key for key, jp in key_to_jp.items()}
        return self._jp_to_key_map

    def get_name(self) -> str:
        """ページ内のキャラクター名を抽出して返す。"""
        soup = self._fetch_soup()
        name_el = soup.select_one("#content_1_0+.ie5 tr:nth-child(2) td:last-child")
        return name_el.text.strip() if name_el else "名前が見つからないよ"

    def get_promotion(self) -> List[Dict[str, int]]:
        """昇進素材を抽出する（現状未使用だが将来利用のため保持）。"""
        soup = self._fetch_soup()
        # item keys in correct json order
        keys = [
            "money",
            "contract_disc",
            "rose_mushroom_t1",
            "money",
            "contract_disc",
            "rose_mushroom_t2",
            "money",
            "contract_disc_set",
            "rose_mushroom_t3",
            "money",
            "contract_disc_set",
            "bloodtide_mushroom",
            "ultra_range_spectro_tube",
        ]
        nums_per_row = [3, 3, 3, 4]
        result: List[Dict[str, int]] = []
        key_idx = 0
        for i, n_item in enumerate(nums_per_row, 1):
            entry: Dict[str, int] = {}
            for j in range(1, n_item + 1):
                promotion_el = soup.select_one(
                    f"#content_1_1+.ie5 tr:nth-child({2*i+1})>td:nth-child({j})"
                )
                value = 0
                if promotion_el and promotion_el.text:
                    match = re.search(r"\d[\d,]*", promotion_el.text.replace(",", ""))
                    if match:
                        value = int(match.group().replace(",", ""))
                entry[keys[key_idx]] = value
                key_idx += 1
            result.append(entry)
        return result

    def get_qualities(self) -> List[List[Dict[str, int]]]:
        """素質素材を抽出する（現状未使用だが将来利用のため保持）。"""
        soup = self._fetch_soup()
        result: List[List[Dict[str, int]]] = [[], []]
        for offset in range(2, 4):
            current_result: List[List[Dict[str, int]]] = [[], []]
            rows = soup.select(f"#content_1_{offset}+.ie5 tr")
            if len(rows) >= 4:
                for idx, row in enumerate(rows[1:5]):
                    row_text = row.get_text(" ", strip=True).replace(",", "")
                    matches = re.findall(r"x(\d+)", row_text)
                    if len(matches) < 2:
                        continue
                    group = 0 if idx < 2 else 1
                    current_result[group].append(
                        {
                            "money": int(matches[1]),
                            "contract_prism": int(matches[0]),
                        }
                    )
            else:
                for group in range(2):
                    selector = f"#content_1_{offset + group}+.ie5 tr"
                    rows = soup.select(selector)
                    for row in rows[
                        1:3
                    ]:  # tr:nth-child(2)と(3)→Pythonの0-indexなので1と2
                        row_text = row.get_text(" ", strip=True)
                        matches = re.findall(r"x(\d+)", row_text)
                        entry = {
                            "money": int(matches[1]) if len(matches) > 1 else 0,
                            "contract_prism": (
                                int(matches[0]) if len(matches) > 0 else 0
                            ),
                        }
                        current_result[group].append(entry)
            result = current_result
            merged_rows = current_result[0] + current_result[1]
            has_zero = any(
                any(value == 0 for value in row.values()) for row in merged_rows
            )
            has_empty_group = any(len(group_data) == 0 for group_data in current_result)
            if len(merged_rows) > 0 and not has_zero and not has_empty_group:
                return current_result
        return result

    def get_assignments(self) -> List[Dict[str, int]]:
        """配属スキル素材を抽出する（現状未使用だが将来利用のため保持）。"""
        soup = self._fetch_soup()
        fields_order = [
            ("money", "contract_prism"),
            ("money", "contract_prism_set"),
            ("money", "contract_prism"),
            ("money", "contract_prism_set"),
        ]
        assignments: List[Dict[str, int]] = []
        for i in range(4):
            assignments = []
            for j, (money_key, item_key) in enumerate(fields_order):
                row_index = j + 1
                money_val = 0
                item_val = 0
                item_cell = soup.select_one(
                    f"#content_1_{13+i}+.ie5 tr:nth-child({row_index+1}) td:nth-child(3)"
                )
                if item_cell:
                    item_text = item_cell.get_text(strip=True).replace(",", "")
                    matches = re.findall(r"x(\d+)", item_text)
                    if len(matches) > 0:
                        item_val = int(matches[0])
                    if len(matches) > 1:
                        money_val = int(matches[1])
                assignments.append({money_key: money_val, item_key: item_val})
            has_zero = any(
                row.get(money_key, 0) == 0 or row.get(item_key, 0) == 0
                for row, (money_key, item_key) in zip(assignments, fields_order)
            )
            if not has_zero:
                break
        return assignments

    def get_skills(self) -> List[Dict[str, int]]:
        """通常スキルの育成素材を抽出する。"""
        skill_order = [
            ("money", "contract_prism", "crystal_sharp_leaf"),
            ("money", "contract_prism", "crystal_sharp_leaf"),
            ("money", "contract_prism", "pure_crystal_sharp_leaf"),
            ("money", "contract_prism", "pure_crystal_sharp_leaf"),
            ("money", "contract_prism", "pure_crystal_sharp_leaf"),
            ("money", "contract_prism_set", "supreme_crystal_sharp_leaf"),
            ("money", "contract_prism_set", "supreme_crystal_sharp_leaf"),
            ("money", "contract_prism_set", "supreme_crystal_sharp_leaf"),
        ]
        soup = self._fetch_soup()
        result: List[Dict[str, int]] = []
        order_index = 0
        for offset in range(10, 13):
            tables = soup.select(f"#content_1_{offset}+div .ie5:nth-child(1)")
            for table in tables:
                rows = table.select("tr")
                for row in rows:
                    header_cell = row.select_one("th")
                    if header_cell and header_cell.get_text(strip=True) == "-":
                        break
                    row_text = row.get_text(" ", strip=True).replace(",", "")
                    matches = re.findall(r"x(\d+)", row_text)
                    if not matches:
                        continue
                    if order_index >= len(skill_order):
                        break
                    keys = skill_order[order_index]
                    entry: Dict[str, int] = {
                        keys[0]: (
                            int(matches[2]) if len(matches) > 2 else 0
                        ),  # money <- 3番目
                        keys[1]: (
                            int(matches[0]) if len(matches) > 0 else 0
                        ),  # prism <- 1番目
                        keys[2]: (
                            int(matches[1]) if len(matches) > 1 else 0
                        ),  # leaf <- 2番目
                    }
                    result.append(entry)
                    order_index += 1
                if result and any(val == 0 for val in result[-1].values()):
                    return result
            if order_index >= len(skill_order):
                break
        return result

    def _parse_specialization_table(self, table) -> List[Dict[str, int]]:
        """特化テーブル1つを解析し、段階ごとの素材辞書配列に変換する。"""
        jp_to_key = self._get_jp_to_key_map()
        result: List[Dict[str, int]] = []
        materials = table.select("tr:nth-child(2) > td img")
        keys: List[str] = []
        for material in materials:
            jp_name = material.get("alt", "")
            key_name = jp_to_key.get(jp_name, jp_name)
            if key_name and key_name not in keys:
                keys.append(key_name)

        needs = table.select("tr:nth-child(n+3)")
        for need in needs:
            need_text = need.get_text(" ", strip=True).replace(",", "")
            matches = re.findall(r"x(\d+)(k?)", need_text, flags=re.IGNORECASE)
            if not matches:
                continue
            entry: Dict[str, int] = {}
            for idx, key in enumerate(keys):
                if idx >= len(matches):
                    entry[key] = 0
                    continue
                number_text, suffix = matches[idx]
                value = int(number_text)
                if key == "money" and suffix.lower() == "k":
                    value *= 1000
                entry[key] = value
            result.append(entry)
        return result

    def get_specializations(self) -> Tuple[List[Dict[str, int]], List[Dict[str, int]]]:
        """特化1/特化2の素材テーブルを抽出して返す。"""
        soup = self._fetch_soup()
        specializations1: List[Dict[str, int]] = []
        specializations2: List[Dict[str, int]] = []
        for offset in range(11, 14):
            tables = soup.select(f"#content_1_{offset}+div .ie5")
            current_specializations1: List[Dict[str, int]] = []
            current_specializations2: List[Dict[str, int]] = []
            if len(tables) > 0:
                current_specializations1 = self._parse_specialization_table(tables[0])
            if len(tables) > 1:
                current_specializations2 = self._parse_specialization_table(tables[1])

            merged_rows = current_specializations1 + current_specializations2
            has_zero = any(
                any(value == 0 for value in row.values()) for row in merged_rows
            )
            has_less_than_five_fields = any(len(row) < 5 for row in merged_rows)
            specializations1 = current_specializations1
            specializations2 = current_specializations2
            if not has_zero and not has_less_than_five_fields and len(merged_rows) > 0:
                break
        return specializations1, specializations2

    # 能力値強化：現状不要だが残す(違う箇所を拾いに行ってる疑いがある)
    def get_abilities(self) -> List[Dict[str, int]]:
        """能力値強化素材を抽出する（現状未使用だが将来利用のため保持）。"""
        soup = self._fetch_soup()
        rows = soup.select("#content_1_14+.ie5 tr:nth-child(n+2)")
        item_keys = [
            "contract_prism",
            "contract_prism",
            "contract_prism_set",
            "contract_prism_set",
        ]
        abilities: List[Dict[str, int]] = []
        for idx, row in enumerate(rows[: len(item_keys)]):
            cell3 = row.select_one("td:nth-child(3)")
            cell4 = row.select_one("td:nth-child(4)")
            text3 = cell3.get_text(" ", strip=True).replace(",", "") if cell3 else ""
            text4 = cell4.get_text(" ", strip=True).replace(",", "") if cell4 else ""
            matches3 = re.findall(r"x(\d+)", text3)
            matches4 = re.findall(r"x(\d+)", text4)
            matches = matches4 if matches4 else matches3
            item_val = int(matches[0]) if len(matches) > 0 else 0
            money_val = int(matches[1]) if len(matches) > 1 else 0
            abilities.append({"money": money_val, item_keys[idx]: item_val})
        return abilities

    def get_equipment(self) -> List[Dict[str, int]]:
        """装備適正素材を抽出する（現状未使用だが将来利用のため保持）。"""
        soup = self._fetch_soup()
        jp_to_key = self._get_jp_to_key_map()
        equipment: List[Dict[str, int]] = []
        for offset in range(12, 16):
            rows = soup.select(f"#content_1_{offset}+.ie5 td:nth-child(2)")
            current_equipment: List[Dict[str, int]] = []
            for row in rows:
                text = row.get_text(" ", strip=True).replace(",", "")
                matches = re.findall(r"x(\d+)", text)
                if not matches:
                    continue
                key_positions: List[Tuple[int, str]] = []
                for jp_name, key_name in jp_to_key.items():
                    pos = text.find(jp_name)
                    if pos >= 0:
                        key_positions.append((pos, key_name))
                key_positions.sort(key=lambda x: x[0])
                keys = [key for _, key in key_positions]
                entry: Dict[str, int] = {}
                for idx, key in enumerate(keys):
                    if idx >= len(matches):
                        entry[key] = 0
                        continue
                    entry[key] = int(matches[idx])
                if entry:
                    current_equipment.append(entry)
            has_zero = any(
                any(value == 0 for value in row.values()) for row in current_equipment
            )
            equipment = current_equipment
            if not has_zero and len(current_equipment) > 0:
                break
        return equipment

    def get_file_name(self) -> str:
        """ページ下部の英語名から保存用ファイル名を取得する。"""
        soup = self._fetch_soup()
        for i in range(20):  # 適当な最大回数（必要に応じて増やせる）
            selector = f"#content_1_{30 + i}+p"
            name_el = soup.select_one(selector)
            if name_el and name_el.text:
                text = name_el.text.strip()
                # テキスト例: "中国語名：xxx　英語名：yyy"
                # 正規表現で「英語名：」の後ろをとる（全角スペースや改行に注意）
                match = re.search(r"英語名[:：]\s*([^\s]+)", text)
                if match:
                    return match.group(1)
        return ""

    def get_data(self) -> Dict[str, object]:
        """出力JSON形式のキャラクターデータを組み立てて返す。"""
        specializations1, specializations2 = self.get_specializations()
        return {
            "name": self.get_name(),
            "promotion": [
                {"money": 1600, "contract_disc": 8, "rose_mushroom_t1": 3},
                {"money": 6500, "contract_disc": 25, "rose_mushroom_t2": 5},
                {"money": 18000, "contract_disc_set": 24, "rose_mushroom_t3": 5},
                {
                    "money": 100000,
                    "contract_disc_set": 36,
                    "bloodtide_mushroom": 8,
                    "ultra_range_spectro_tube": 20,
                },
            ],
            "assignments": [
                {"money": 1600, "contract_prism": 6},
                {"money": 8000, "contract_prism_set": 12},
                {"money": 3000, "contract_prism": 12},
                {"money": 20000, "contract_prism_set": 20},
            ],
            "qualities": [
                [
                    {"money": 2400, "contract_prism": 12},
                    {"money": 8600, "contract_prism": 40},
                ],
                [
                    {"money": 10000, "contract_prism": 48},
                    {"money": 24000, "contract_prism": 28},
                ],
            ],
            "skills": self.get_skills(),
            "specializations1": specializations1,
            "specializations2": specializations2,
            "abilities": [
                {"money": 1000, "contract_prism": 5},
                {"money": 1800, "contract_prism": 10},
                {"money": 6000, "contract_prism_set": 10},
                {"money": 12000, "contract_prism_set": 20},
            ],
            "equipment": [{"money": 1600}, {"money": 6500}, {"money": 18000}],
        }

    def save_json(self) -> None:
        """抽出データを `character/<英語名>.json` に保存する。"""
        try:
            file_name = "test.json"
            result_data = self.get_data()
            name = self.get_file_name()
            if not name:
                name = "unknown"
            file_name = f"character/{name}.json"
            with open(file_name, "w", encoding="utf-8") as f:
                json.dump(result_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving {file_name}: {e}")


def run_all_mode():
    """一覧ページから全キャラURLを収集し、順番にJSON保存する。"""

    BASE_URL = "https://arknights-endfield.wikiru.jp"
    url = f"{BASE_URL}/?%E3%82%AA%E3%83%9A%E3%83%AC%E3%83%BC%E3%82%BF%E3%83%BC%E4%B8%80%E8%A6%A7/%E8%81%B7%E6%A5%AD%E5%88%A5"

    response = requests.get(url, timeout=20)
    response.encoding = response.apparent_encoding
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    elements = soup.select(".full_hr+.ie5")
    links = []
    for el in elements:
        links.extend(el.select('a[href^="./?%"]'))
    hrefs = sorted(set(a["href"] for a in links))
    full_urls = [
        BASE_URL + href[1:] if href.startswith("./") else BASE_URL + href
        for href in hrefs
    ]

    print(f"{len(full_urls)} links found matching './?+':")
    for full_url in full_urls:
        print(f"  {full_url}")

    for _, link_url in enumerate(tqdm(full_urls, desc="Scraping all links")):
        try:
            scraper = EndfieldScraper(link_url)
            scraper.save_json()
            time.sleep(1)  # 負荷対策で少しスリープ
        except Exception as e:
            print(f"Error scraping {link_url}: {e}")


def main() -> None:
    """CLI引数を解釈して単体処理または全件処理を実行する。"""
    parser = argparse.ArgumentParser(description="EndfieldScraper CLI")
    parser.add_argument(
        "url", nargs="?", type=str, help="スクレイピングしたいページURL"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="全データを処理する",
    )
    args = parser.parse_args()

    if args.all:
        run_all_mode()
        return

    if not args.url:
        parser.error("通常モードでは url が必要。全件処理は --all を使って。")

    url = args.url
    scraper = EndfieldScraper(url)

    try:
        result_data = scraper.get_data()
        scraper.save_json()
    except Exception as e:
        print(f"ページの取得か抽出に失敗した。エラー: {e}")


if __name__ == "__main__":
    main()
