const characterListEl = document.getElementById("character-list");
const totalListEl = document.getElementById("total-list");
const emptyMessageEl = document.getElementById("empty-message");
const loadingEl = document.getElementById("loading");
const detailsListEl = document.getElementById("details-list");
const detailsEmptyMessageEl = document.getElementById("details-empty-message");

const ITEM_NAME_MAP_URL = "./trans.json";
const ITEM_ORDER_URL = "./item-order.json";
const CHARACTER_DIR_URL = "./character/";
const ITEM_IMAGE_BASES = ["./img/material/", "./img/"];
const MAX_COLUMNS_PER_TABLE = 5;

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

  function collect(value, keyName) {
    if (keyName === "name") {
      return;
    }
    if (typeof value === "number" && Number.isFinite(value) && keyName) {
      totals[keyName] = (totals[keyName] || 0) + value;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => collect(entry, null));
      return;
    }
    if (isPlainObject(value)) {
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        collect(nestedValue, nestedKey);
      });
    }
  }

  collect(characterData, null);
  return totals;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildDefaultProgress(characterData) {
  return {
    promotion: 0,
    skillProgress: [0, 0, 0, 0],
    assignments: 0,
    equipment: 0,
    abilities: 0,
    qualities: safeArray(characterData.qualities).map(() => 0),
  };
}

function appendRemainingSlices(target, source, values) {
  values.forEach((value) => {
    target.push(...safeArray(source).slice(value));
  });
}

function buildCharacterDataByProgress(characterData, progress) {
  const source = characterData || {};
  const skills = [];
  const specializations1 = [];
  const specializations2 = [];
  const skillProgress = progress.skillProgress || [0, 0, 0, 0];
  const normalSkillDisplayMax = 9;
  const normalSkillDataMax = safeArray(source.skills).length;
  const spec1Max = Math.min(3, safeArray(source.specializations1).length);
  const spec2Max = Math.min(3, safeArray(source.specializations2).length);
  const skillLevels = skillProgress.map((value) =>
    Math.max(0, Math.min(value, normalSkillDisplayMax))
  );
  const skillSpecializations = skillProgress.map((value, index) => {
    const specMax = index < 2 ? spec1Max : spec2Max;
    return Math.max(0, Math.min(value - normalSkillDisplayMax, specMax));
  });

  appendRemainingSlices(
    skills,
    source.skills,
    skillLevels.map((value) => Math.max(0, Math.min(value, normalSkillDataMax)))
  );
  appendRemainingSlices(specializations1, source.specializations1, [
    skillSpecializations[0] || 0,
    skillSpecializations[1] || 0,
  ]);
  appendRemainingSlices(specializations2, source.specializations2, [
    skillSpecializations[2] || 0,
    skillSpecializations[3] || 0,
  ]);
  return {
    promotion: safeArray(source.promotion).slice(progress.promotion),
    skills,
    assignments: safeArray(source.assignments).slice(progress.assignments),
    equipment: safeArray(source.equipment).slice(progress.equipment),
    abilities: safeArray(source.abilities).slice(progress.abilities),
    qualities: safeArray(source.qualities).map((entry, index) =>
      safeArray(entry).slice(progress.qualities[index] || 0)
    ),
    specializations1,
    specializations2,
  };
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
        rawData: parsed,
      });
    } catch (_error) {
      // Ignore invalid files and continue.
    }
  }

  return characters;
}

function renderTotals(selectedCharacters, itemNameMap, itemOrder, progressByCharacter) {
  totalListEl.innerHTML = "";

  if (selectedCharacters.length === 0) {
    emptyMessageEl.hidden = false;
    return;
  }

  const totals = {};
  selectedCharacters.forEach((character) => {
    const progress =
      progressByCharacter.get(character.fileName) ||
      buildDefaultProgress(character.rawData);
    const filteredData = buildCharacterDataByProgress(character.rawData, progress);
    const items = aggregateCharacterItems(filteredData);
    addNumericFields(totals, items);
  });

  const knownKeys = itemOrder.length > 0 ? [...itemOrder] : Object.keys(itemNameMap);
  const mergedKeys = Array.from(new Set([...knownKeys, ...Object.keys(totals)]));
  const keys = sortItemKeys(mergedKeys, itemOrder, itemNameMap);
  if (keys.length === 0) {
    emptyMessageEl.textContent = "対象素材がない。";
    emptyMessageEl.hidden = false;
    return;
  }

  emptyMessageEl.hidden = true;
  renderTotalsTables(keys, totals, itemNameMap);
}

function sortItemKeys(keys, itemOrder, itemNameMap) {
  const orderMap = new Map(itemOrder.map((key, index) => [key, index]));
  return [...keys].sort((a, b) => {
    const aOrder = orderMap.has(a) ? orderMap.get(a) : Number.POSITIVE_INFINITY;
    const bOrder = orderMap.has(b) ? orderMap.get(b) : Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    const aLabel = itemNameMap[a] || a;
    const bLabel = itemNameMap[b] || b;
    return aLabel.localeCompare(bLabel, "ja");
  });
}

function createImageElement(itemKey, label) {
  const img = document.createElement("img");
  img.alt = label;
  img.loading = "lazy";
  img.className = "material-image";

  let index = 0;
  const tryNextImage = () => {
    if (index >= ITEM_IMAGE_BASES.length) {
      img.replaceWith(document.createTextNode("-"));
      return;
    }
    img.src = `${ITEM_IMAGE_BASES[index]}${itemKey}.png`;
    index += 1;
  };

  img.addEventListener("error", tryNextImage);
  tryNextImage();
  return img;
}

function renderTotalsTables(keys, totals, itemNameMap) {
  for (let start = 0; start < keys.length; start += MAX_COLUMNS_PER_TABLE) {
    const chunk = keys.slice(start, start + MAX_COLUMNS_PER_TABLE);
    const table = document.createElement("table");
    table.className = "materials-table";

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    const nameRow = document.createElement("tr");
    const imageRow = document.createElement("tr");
    const countRow = document.createElement("tr");

    chunk.forEach((key) => {
      const label = itemNameMap[key] || key;
      const count = totals[key] || 0;
      const isZero = count === 0;

      const nameCell = document.createElement("th");
      nameCell.scope = "col";
      nameCell.textContent = label;
      if (isZero) {
        nameCell.classList.add("is-zero");
      }
      nameRow.appendChild(nameCell);

      const imageCell = document.createElement("td");
      imageCell.className = "image-cell";
      if (isZero) {
        imageCell.classList.add("is-zero");
      }
      imageCell.appendChild(createImageElement(key, label));
      imageRow.appendChild(imageCell);

      const countCell = document.createElement("td");
      countCell.className = "count-cell";
      if (isZero) {
        countCell.classList.add("is-zero");
      }
      countCell.textContent = String(count);
      countRow.appendChild(countCell);
    });

    tbody.appendChild(nameRow);
    tbody.appendChild(imageRow);
    tbody.appendChild(countRow);
    totalListEl.appendChild(table);
  }
}

function renderCharacterList(characters, itemNameMap, itemOrder) {
  characterListEl.innerHTML = "";

  if (characters.length === 0) {
    loadingEl.textContent = "キャラクターデータが見つからない。";
    return;
  }

  loadingEl.hidden = true;
  const selected = new Set();
  const progressByCharacter = new Map();
  characters.forEach((character) => {
    progressByCharacter.set(character.fileName, buildDefaultProgress(character.rawData));
  });

  const updateTotals = () => {
    const selectedCharacters = characters.filter((item) =>
      selected.has(item.fileName)
    );
    renderDetailsControls(selectedCharacters, progressByCharacter, updateTotals);
    renderTotals(selectedCharacters, itemNameMap, itemOrder, progressByCharacter);
  };

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
      updateTotals();
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

  updateTotals();
}

function createStageSelect(currentValue, maxValue, optionLabelBuilder) {
  const select = document.createElement("select");
  for (let stage = 0; stage <= maxValue; stage += 1) {
    const option = document.createElement("option");
    option.value = String(stage);
    option.textContent = optionLabelBuilder ? optionLabelBuilder(stage) : String(stage);
    if (stage === currentValue) {
      option.selected = true;
    }
    select.appendChild(option);
  }
  return select;
}

function createDetailRow(labelText, currentValue, maxValue, onChange, optionLabelBuilder) {
  const row = document.createElement("div");
  row.className = "detail-row";

  const label = document.createElement("label");
  label.textContent = labelText;

  const select = createStageSelect(currentValue, maxValue, optionLabelBuilder);
  select.addEventListener("change", () => {
    onChange(Number(select.value));
  });

  row.appendChild(label);
  row.appendChild(select);
  return row;
}

function renderDetailsControls(selectedCharacters, progressByCharacter, onChange) {
  detailsListEl.innerHTML = "";

  if (selectedCharacters.length === 0) {
    detailsEmptyMessageEl.hidden = false;
    return;
  }
  detailsEmptyMessageEl.hidden = true;

  selectedCharacters.forEach((character) => {
    const source = character.rawData || {};
    const progress = progressByCharacter.get(character.fileName);
    if (!progress) {
      return;
    }

    const card = document.createElement("section");
    card.className = "character-detail";

    const title = document.createElement("h3");
    title.textContent = character.displayName;
    card.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "detail-grid";

    grid.appendChild(
      createDetailRow("昇進段階", progress.promotion, safeArray(source.promotion).length, (value) => {
        progress.promotion = value;
        onChange();
      })
    );

    const skillLevelMax = 9;
    const spec1Max = Math.min(3, safeArray(source.specializations1).length);
    const spec2Max = Math.min(3, safeArray(source.specializations2).length);
    const buildSkillOptionLabel = (value) =>
      value <= skillLevelMax ? String(value) : `特化${value - skillLevelMax}`;

    for (let index = 0; index < 4; index += 1) {
      const specMax = index < 2 ? spec1Max : spec2Max;
      const maxValue = skillLevelMax + specMax;
      grid.appendChild(
        createDetailRow(
          `スキル${index + 1}`,
          progress.skillProgress[index] || 0,
          maxValue,
          (value) => {
            progress.skillProgress[index] = value;
            onChange();
          },
          buildSkillOptionLabel
        )
      );
    }

    safeArray(source.qualities).forEach((entry, index) => {
      grid.appendChild(
        createDetailRow(
          `素質${index + 1}`,
          progress.qualities[index] || 0,
          safeArray(entry).length,
          (value) => {
            progress.qualities[index] = value;
            onChange();
          }
        )
      );
    });

    grid.appendChild(
      createDetailRow(
        "配属スキル",
        progress.assignments,
        safeArray(source.assignments).length,
        (value) => {
          progress.assignments = value;
          onChange();
        }
      )
    );

    grid.appendChild(
      createDetailRow("装備適正", progress.equipment, safeArray(source.equipment).length, (value) => {
        progress.equipment = value;
        onChange();
      })
    );

    grid.appendChild(
      createDetailRow("能力値強化", progress.abilities, safeArray(source.abilities).length, (value) => {
        progress.abilities = value;
        onChange();
      })
    );

    card.appendChild(grid);
    detailsListEl.appendChild(card);
  });
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

async function loadItemOrder() {
  try {
    const response = await fetch(ITEM_ORDER_URL);
    if (!response.ok) {
      return [];
    }
    const list = await response.json();
    if (!Array.isArray(list)) {
      return [];
    }
    return list.filter((key) => typeof key === "string" && key.trim() !== "");
  } catch (_error) {
    return [];
  }
}

async function main() {
  const [itemNameMap, itemOrder, characters] = await Promise.all([
    loadItemNameMap(),
    loadItemOrder(),
    loadCharacters(),
  ]);
  renderCharacterList(characters, itemNameMap, itemOrder);
}

main();
