import json
import re
from typing import Dict, Optional, List
import requests
from bs4 import BeautifulSoup


class EndfieldScraper:
    """URLを固定して必要なデータをget_xxx形式で取得するスクレイパー。"""

    def __init__(self, url: str) -> None:
        self.url = url
        self._soup: Optional[BeautifulSoup] = None

    def _fetch_soup(self, force_refresh: bool = False) -> BeautifulSoup:
        if self._soup is not None and not force_refresh:
            return self._soup

        response = requests.get(self.url, timeout=20)
        response.encoding = response.apparent_encoding  # 文字化け対策
        response.raise_for_status()

        self._soup = BeautifulSoup(response.text, "html.parser")
        return self._soup

    def get_name(self) -> str:
        soup = self._fetch_soup()
        name_el = soup.select_one("#content_1_0+.ie5 tr:nth-child(2)>td:nth-child(3)")
        return name_el.text.strip() if name_el else "名前が見つからないよ"

    def get_promotion(self) -> List[Dict[str, int]]:
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

    def get_assignments(self) -> List[List[Dict[str, int]]]:
        soup = self._fetch_soup()
        result: List[List[Dict[str, int]]] = [[], []]
        for group in range(2):
            selector = f"#content_1_{4+group}+.ie5 tr"
            rows = soup.select(selector)
            for row in rows[1:3]:  # tr:nth-child(2)と(3)→Pythonの0-indexなので1と2
                row_text = row.get_text(" ", strip=True)
                matches = re.findall(r"x(\d+)", row_text)
                entry = {
                    "money": int(matches[1]) if len(matches) > 1 else 0,
                    "contract_prism": int(matches[0]) if len(matches) > 0 else 0,
                }
                result[group].append(entry)
        return result

    def get_data(self) -> Dict[str, str]:
        return {
            "name": self.get_name(),
            "promotion": self.get_promotion(),
            "assignments": self.get_assignments(),
        }

    def save_json(self, filename: str = "character_data.json") -> None:
        result_data = self.get_data()
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)


def main() -> None:
    url = "https://arknights-endfield.wikiru.jp/?%E3%83%AA%E3%83%BC%E3%83%95%E3%82%A9%E3%83%B3"
    scraper = EndfieldScraper(url)

    try:
        result_data = scraper.get_data()
        print("抽出したデータ:", result_data)
        scraper.save_json("character_data.json")
        print("character_data.json の保存処理が終わったよ。")
    except Exception as e:
        print(f"ページの取得か抽出に失敗した。エラー: {e}")


if __name__ == "__main__":
    main()
