const characterListEl = document.getElementById("character-list");
const totalListEl = document.getElementById("total-list");
const emptyMessageEl = document.getElementById("empty-message");
const loadingEl = document.getElementById("loading");
const detailsListEl = document.getElementById("details-list");
const detailsEmptyMessageEl = document.getElementById("details-empty-message");

const ITEM_NAME_MAP_URL = "./trans.json";
const ITEM_ORDER_URL = "./item-order.json";
const EXPERIENCE_URL = "./experience.json";
const CHARACTER_DIR_URL = "./character/";
const ITEM_IMAGE_BASES = ["./img/material/", "./img/"];
const MAX_COLUMNS_PER_TABLE = 5;
const ADVANCED_OPERATION_RECORD_KEY = "advanced_operation_record";
const ADVANCED_RECOGNITION_MEDIUM_KEY = "advanced_recognition_medium";
const ADVANCED_OPERATION_RECORD_EXP = 10000;
const ADVANCED_RECOGNITION_MEDIUM_EXP = 10000;
const ADVANCED_OPERATION_RECORD_LEVEL_CAP = 60;

function setHiddenIfPresent(element, hidden) {
  if (element) {
    element.hidden = hidden;
  }
}

function setTextIfPresent(element, text) {
  if (element) {
    element.textContent = text;
  }
}

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
    level: 1,
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

function getMaxExperienceLevel(experienceTable) {
  if (experienceTable.length === 0) {
    return 1;
  }
  return experienceTable[experienceTable.length - 1].lv;
}

function getTotalExperienceAtLevel(experienceTable, level) {
  const matched = experienceTable.find((entry) => entry.lv === level);
  return matched ? matched.total : 0;
}

function getExperienceBetweenLevels(experienceTable, fromLevel, toLevel) {
  if (experienceTable.length === 0) {
    return 0;
  }
  const maxLevel = getMaxExperienceLevel(experienceTable);
  const safeFrom = Math.max(1, Math.min(fromLevel, maxLevel));
  const safeTo = Math.max(safeFrom, Math.min(toLevel, maxLevel));
  return Math.max(
    0,
    getTotalExperienceAtLevel(experienceTable, safeTo) -
      getTotalExperienceAtLevel(experienceTable, safeFrom)
  );
}

function getRemainingExperienceMaterialCounts(experienceTable, currentLevel) {
  if (experienceTable.length === 0) {
    return {
      [ADVANCED_OPERATION_RECORD_KEY]: 0,
      [ADVANCED_RECOGNITION_MEDIUM_KEY]: 0,
    };
  }

  const maxLevel = getMaxExperienceLevel(experienceTable);
  const safeLevel = Math.max(1, Math.min(currentLevel, maxLevel));
  const operationEndLevel = Math.min(ADVANCED_OPERATION_RECORD_LEVEL_CAP, maxLevel);
  const operationExp = getExperienceBetweenLevels(experienceTable, safeLevel, operationEndLevel);
  const recognitionExp =
    maxLevel > ADVANCED_OPERATION_RECORD_LEVEL_CAP
      ? getExperienceBetweenLevels(
          experienceTable,
          Math.max(safeLevel, ADVANCED_OPERATION_RECORD_LEVEL_CAP),
          maxLevel
        )
      : 0;

  return {
    [ADVANCED_OPERATION_RECORD_KEY]: Math.ceil(operationExp / ADVANCED_OPERATION_RECORD_EXP),
    [ADVANCED_RECOGNITION_MEDIUM_KEY]: Math.ceil(
      recognitionExp / ADVANCED_RECOGNITION_MEDIUM_EXP
    ),
  };
}

function parseMoneyRange(rangeText) {
  if (typeof rangeText !== "string") {
    return null;
  }
  const matched = rangeText.match(/Lv\s*(\d+)\s*-\s*(\d+)/i);
  if (!matched) {
    return null;
  }
  const start = Number.parseInt(matched[1], 10);
  const end = Number.parseInt(matched[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return null;
  }
  return { start, end };
}

function getRemainingLevelMoney(moneyRanges, currentLevel, maxLevel) {
  if (!Array.isArray(moneyRanges) || moneyRanges.length === 0) {
    return 0;
  }
  const safeLevel = Math.max(1, Math.min(currentLevel, maxLevel));
  let total = 0;
  moneyRanges.forEach((entry) => {
    const parsedRange = parseMoneyRange(entry.range);
    if (!parsedRange) {
      return;
    }
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return;
    }
    const overlapStart = Math.max(safeLevel, parsedRange.start);
    const overlapEnd = Math.min(maxLevel, parsedRange.end);
    const levels = Math.max(0, overlapEnd - overlapStart);
    total += levels * amount;
  });
  return total;
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

  return characters.sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
}

function renderTotals(
  selectedCharacters,
  itemNameMap,
  itemOrder,
  progressByCharacter,
  experienceTable,
  experienceMoneyRanges
) {
  totalListEl.innerHTML = "";

  if (selectedCharacters.length === 0) {
    setHiddenIfPresent(emptyMessageEl, false);
    return;
  }

  const totals = {};
  selectedCharacters.forEach((character) => {
    const progress =
      progressByCharacter.get(character.fileName) ||
      buildDefaultProgress(character.rawData);
    const filteredData = buildCharacterDataByProgress(character.rawData, progress);
    const items = aggregateCharacterItems(filteredData);
    const levelItems = getRemainingExperienceMaterialCounts(experienceTable, progress.level);
    const maxLevel = getMaxExperienceLevel(experienceTable);
    items.money =
      (items.money || 0) + getRemainingLevelMoney(experienceMoneyRanges, progress.level, maxLevel);
    addNumericFields(items, levelItems);
    addNumericFields(totals, items);
  });

  const knownKeys = itemOrder.length > 0 ? [...itemOrder] : Object.keys(itemNameMap);
  const mergedKeys = Array.from(new Set([...knownKeys, ...Object.keys(totals)]));
  const keys = sortItemKeys(mergedKeys, itemOrder, itemNameMap);
  if (keys.length === 0) {
    setTextIfPresent(emptyMessageEl, "対象素材がない。");
    setHiddenIfPresent(emptyMessageEl, false);
    return;
  }

  setHiddenIfPresent(emptyMessageEl, true);
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

function renderCharacterList(
  characters,
  itemNameMap,
  itemOrder,
  experienceTable,
  experienceMoneyRanges
) {
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
    renderDetailsControls(selectedCharacters, progressByCharacter, updateTotals, experienceTable);
    renderTotals(
      selectedCharacters,
      itemNameMap,
      itemOrder,
      progressByCharacter,
      experienceTable,
      experienceMoneyRanges
    );
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

    const text = document.createElement("span");
    text.textContent = character.displayName;

    label.appendChild(checkbox);
    label.appendChild(text);
    characterListEl.appendChild(label);
  });

  updateTotals();
}

function createStageSelect(currentValue, minValue, maxValue, optionLabelBuilder) {
  const select = document.createElement("select");
  for (let stage = minValue; stage <= maxValue; stage += 1) {
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

function createDetailRow(
  labelText,
  currentValue,
  maxValue,
  onChange,
  optionLabelBuilder,
  minValue = 0
) {
  const row = document.createElement("div");
  row.className = "detail-row";

  const label = document.createElement("label");
  label.textContent = labelText;

  const select = createStageSelect(currentValue, minValue, maxValue, optionLabelBuilder);
  select.addEventListener("change", () => {
    onChange(Number(select.value));
  });

  row.appendChild(label);
  row.appendChild(select);
  return row;
}

function createNumberInputRow(labelText, currentValue, minValue, maxValue, onChange) {
  const row = document.createElement("div");
  row.className = "detail-row";

  const label = document.createElement("label");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = String(minValue);
  input.max = String(maxValue);
  input.step = "1";
  input.value = String(currentValue);

  const commitValue = () => {
    const parsed = Number.parseInt(input.value, 10);
    const safeValue = Number.isFinite(parsed) ? parsed : minValue;
    const clamped = Math.max(minValue, Math.min(safeValue, maxValue));
    input.value = String(clamped);
    onChange(clamped);
  };

  input.addEventListener("change", commitValue);
  input.addEventListener("blur", commitValue);

  row.appendChild(label);
  row.appendChild(input);
  return row;
}

function renderDetailsControls(selectedCharacters, progressByCharacter, onChange, experienceTable) {
  detailsListEl.innerHTML = "";

  if (selectedCharacters.length === 0) {
    setHiddenIfPresent(detailsEmptyMessageEl, false);
    return;
  }
  setHiddenIfPresent(detailsEmptyMessageEl, true);

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

    const maxLevel = getMaxExperienceLevel(experienceTable);
    grid.appendChild(
      createNumberInputRow(
        "今のレベル",
        progress.level || 1,
        1,
        maxLevel,
        (value) => {
          progress.level = value;
          onChange();
        }
      )
    );

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

async function loadExperienceTable() {
  try {
    const response = await fetch(EXPERIENCE_URL);
    if (!response.ok) {
      return [];
    }
    const payload = await response.json();
    const list = safeArray(payload.experience)
      .filter(
        (entry) =>
          isPlainObject(entry) &&
          typeof entry.lv === "number" &&
          Number.isFinite(entry.lv) &&
          typeof entry.total === "number" &&
          Number.isFinite(entry.total)
      )
      .sort((a, b) => a.lv - b.lv);
    const moneyRanges = safeArray(payload.money)
      .filter(
        (entry) =>
          isPlainObject(entry) &&
          typeof entry.range === "string" &&
          typeof entry.amount === "number" &&
          Number.isFinite(entry.amount)
      )
      .map((entry) => ({ range: entry.range, amount: entry.amount }));
    return { table: list, moneyRanges };
  } catch (_error) {
    return { table: [], moneyRanges: [] };
  }
}

async function main() {
  const [itemNameMap, itemOrder, experienceData, characters] = await Promise.all([
    loadItemNameMap(),
    loadItemOrder(),
    loadExperienceTable(),
    loadCharacters(),
  ]);
  renderCharacterList(
    characters,
    itemNameMap,
    itemOrder,
    experienceData.table,
    experienceData.moneyRanges
  );
}

main();
