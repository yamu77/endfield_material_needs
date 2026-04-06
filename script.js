const characterListEl = document.getElementById("character-list");
const totalListEl = document.getElementById("total-list");
const emptyMessageEl = document.getElementById("empty-message");
const loadingEl = document.getElementById("loading");

const ITEM_NAME_MAP_URL = "./trans.json";
const CHARACTER_DIR_URL = "./character/";

function parseJsonc(text) {
  const withoutLineComments = text.replace(/(^|[^\\])\/\/.*$/gm, "$1");
  const withoutBlockComments = withoutLineComments.replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );
  const withoutTrailingComma = withoutBlockComments.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(withoutTrailingComma);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addNumericFields(target, source) {
  Object.entries(source).forEach(([key, value]) => {
    if (key === "name") {
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      target[key] = (target[key] || 0) + value;
    }
  });
}

function aggregateCharacterItems(characterData) {
  const totals = {};
  Object.entries(characterData).forEach(([key, value]) => {
    if (key === "name") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (isPlainObject(entry)) {
          addNumericFields(totals, entry);
        }
      });
      return;
    }
    if (isPlainObject(value)) {
      addNumericFields(totals, value);
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      totals[key] = (totals[key] || 0) + value;
    }
  });
  return totals;
}

async function getCharacterFileNames() {
  const collected = new Set();

  try {
    const response = await fetch(CHARACTER_DIR_URL);
    if (response.ok) {
      const html = await response.text();
      const hrefRegex = /href=["']([^"']+)["']/g;
      let match = hrefRegex.exec(html);
      while (match) {
        const href = match[1];
        if (/\.jsonc?$/i.test(href)) {
          const fileName = href.split("/").pop();
          if (fileName) {
            collected.add(fileName);
          }
        }
        match = hrefRegex.exec(html);
      }
    }
  } catch (_error) {
    // Directory listing may be disabled.
  }

  if (collected.size === 0) {
    try {
      const response = await fetch(`${CHARACTER_DIR_URL}index.json`);
      if (response.ok) {
        const list = await response.json();
        if (Array.isArray(list)) {
          list.forEach((name) => {
            if (typeof name === "string" && /\.jsonc?$/i.test(name)) {
              collected.add(name);
            }
          });
        }
      }
    } catch (_error) {
      // Manifest may not exist.
    }
  }

  if (collected.size === 0) {
    collected.add("lifeng.jsonc");
  }

  return Array.from(collected).sort((a, b) => a.localeCompare(b, "ja"));
}

async function loadCharacters() {
  const fileNames = await getCharacterFileNames();
  const characters = [];

  for (const fileName of fileNames) {
    try {
      const response = await fetch(`${CHARACTER_DIR_URL}${fileName}`);
      if (!response.ok) {
        continue;
      }
      const raw = await response.text();
      const parsed = parseJsonc(raw);
      const displayName =
        typeof parsed.name === "string" && parsed.name.trim() !== ""
          ? parsed.name
          : fileName.replace(/\.jsonc?$/i, "");
      characters.push({
        fileName,
        displayName,
        items: aggregateCharacterItems(parsed),
      });
    } catch (_error) {
      // Ignore invalid files and continue.
    }
  }

  return characters;
}

function renderTotals(selectedCharacters, itemNameMap) {
  totalListEl.innerHTML = "";

  if (selectedCharacters.length === 0) {
    emptyMessageEl.hidden = false;
    return;
  }

  const totals = {};
  selectedCharacters.forEach((character) => {
    addNumericFields(totals, character.items);
  });

  const keys = Object.keys(totals).sort((a, b) => a.localeCompare(b, "ja"));
  if (keys.length === 0) {
    emptyMessageEl.textContent = "対象素材がない。";
    emptyMessageEl.hidden = false;
    return;
  }

  emptyMessageEl.hidden = true;
  keys.forEach((key) => {
    const li = document.createElement("li");
    const label = itemNameMap[key] || key;
    li.textContent = `${label}: ${totals[key]}`;
    totalListEl.appendChild(li);
  });
}

function renderCharacterList(characters, itemNameMap) {
  characterListEl.innerHTML = "";

  if (characters.length === 0) {
    loadingEl.textContent = "キャラクターデータが見つからない。";
    return;
  }

  loadingEl.hidden = true;
  const selected = new Set();

  characters.forEach((character, index) => {
    const label = document.createElement("label");
    label.className = "character-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = character.fileName;

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selected.add(character.fileName);
      } else {
        selected.delete(character.fileName);
      }

      const selectedCharacters = characters.filter((item) =>
        selected.has(item.fileName)
      );
      renderTotals(selectedCharacters, itemNameMap);
    });

    if (index === 0) {
      checkbox.checked = true;
      selected.add(character.fileName);
    }

    const text = document.createElement("span");
    text.textContent = character.displayName;

    label.appendChild(checkbox);
    label.appendChild(text);
    characterListEl.appendChild(label);
  });

  const initiallySelected = characters.filter((item) =>
    selected.has(item.fileName)
  );
  renderTotals(initiallySelected, itemNameMap);
}

async function loadItemNameMap() {
  try {
    const response = await fetch(ITEM_NAME_MAP_URL);
    if (!response.ok) {
      return {};
    }
    return await response.json();
  } catch (_error) {
    return {};
  }
}

async function main() {
  const [itemNameMap, characters] = await Promise.all([
    loadItemNameMap(),
    loadCharacters(),
  ]);
  renderCharacterList(characters, itemNameMap);
}

main();
