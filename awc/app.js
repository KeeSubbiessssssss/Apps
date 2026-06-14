const products = [
  { code: "CHK-001", name: "Chicken Breast Fillet" },
  { code: "CHK-002", name: "Chicken Thigh Fillet" },
  { code: "CHK-003", name: "Chicken Drumsticks" },
  { code: "CHK-004", name: "Chicken Wings" },
  { code: "CHK-005", name: "Whole Chicken" },
  { code: "CHK-006", name: "Chicken Mince" },
  { code: "CHK-007", name: "Tenderloins" },
  { code: "CHK-008", name: "Maryland Pieces" }
];

const state = {
  selectedProduct: products[0],
  activeInput: "weightInput",
  replaceActiveInputOnNextKey: false,
  unit: "grams",
  packedDateMode: "today",
  packedDateValue: ""
};

const productImport = document.querySelector("#productImport");
const productSearch = document.querySelector("#productSearch");
const productList = document.querySelector("#productList");
const copiesInput = document.querySelector("#copiesInput");
const weightInput = document.querySelector("#weightInput");
const qtyInput = document.querySelector("#qtyInput");
const keypadTargets = document.querySelectorAll(".keypad-target");
const unitButtons = document.querySelectorAll(".unit-button");
const keypad = document.querySelector(".keypad");
const printButton = document.querySelector("#printButton");
const previewProduct = document.querySelector("#previewProduct");
const previewWeight = document.querySelector("#previewWeight");
const previewQty = document.querySelector("#previewQty");
const packedDate = document.querySelector("#packedDate");
const packedDateInput = document.querySelector("#packedDateInput");
const packedDateToggle = document.querySelector("#packedDateToggle");
const copySummary = document.querySelector("#copySummary");
const printArea = document.querySelector("#printArea");
const settingsButton = document.querySelector("#settingsButton");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsCloseButton = document.querySelector("#settingsCloseButton");
const printerSelect = document.querySelector("#printerSelect");
const presetInput = document.querySelector("#presetInput");
const mediaInput = document.querySelector("#mediaInput");
const orientationSelect = document.querySelector("#orientationSelect");
const fitToPageInput = document.querySelector("#fitToPageInput");
const rawOptionsInput = document.querySelector("#rawOptionsInput");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const settingsStatus = document.querySelector("#settingsStatus");

let localPrintAvailable = false;
let printSettings = {};

function formatDate(date) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function normaliseCopies() {
  const copies = Number.parseInt(copiesInput.value, 10);
  if (!Number.isFinite(copies) || copies < 1) return 1;
  return Math.min(copies, 99);
}

function currentPackedDate() {
  if (state.packedDateMode === "custom" && state.packedDateValue) {
    return formatDate(parseDateInputValue(state.packedDateValue));
  }
  return formatDate(new Date());
}

function currentLabelData() {
  return {
    product: state.selectedProduct?.name || "Select a product",
    weight: weightInput.value ? `${weightInput.value} ${state.unit}` : "--",
    qty: qtyInput.value || "--",
    packedOn: currentPackedDate()
  };
}

function renderProducts() {
  const query = productSearch.value.trim().toLowerCase();
  const visibleProducts = products.filter((product) => {
    const searchable = `${product.code} ${product.name}`.toLowerCase();
    return searchable.includes(query);
  });

  productList.innerHTML = "";

  if (!visibleProducts.length) {
    const empty = document.createElement("div");
    empty.className = "product-option";
    empty.textContent = "No products found";
    productList.append(empty);
    return;
  }

  visibleProducts.forEach((product) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "product-option";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(product === state.selectedProduct));
    if (product === state.selectedProduct) button.classList.add("is-selected");
    button.innerHTML = `<strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.code)}</span>`;
    button.addEventListener("click", () => {
      state.selectedProduct = product;
      renderProducts();
      renderPreview();
    });
    productList.append(button);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setActiveInput(inputId) {
  state.activeInput = inputId;
  state.replaceActiveInputOnNextKey = inputId === "copiesInput" && copiesInput.value === "1";
  keypadTargets.forEach((input) => {
    input.classList.toggle("is-active", input.id === inputId);
  });
}

function applyKey(key) {
  const input = document.querySelector(`#${state.activeInput}`);
  if (!input) return;
  if (key === "." && input.id !== "weightInput") return;
  if (key === "." && input.value.includes(".")) return;
  if (state.replaceActiveInputOnNextKey) {
    input.value = key === "." ? input.value : key;
    state.replaceActiveInputOnNextKey = false;
    renderPreview();
    return;
  }
  if (input.value.length >= 7) return;
  if (input.value === "0" && key !== ".") {
    input.value = key;
  } else {
    input.value += key;
  }
  renderPreview();
}

function applyAction(action) {
  const input = document.querySelector(`#${state.activeInput}`);
  if (!input) return;
  if (action === "clear") input.value = "";
  if (action === "back") input.value = input.value.slice(0, -1);
  if (input.id === "copiesInput" && !input.value) {
    input.value = "1";
    state.replaceActiveInputOnNextKey = true;
  } else {
    state.replaceActiveInputOnNextKey = false;
  }
  renderPreview();
}

function renderPreview() {
  const data = currentLabelData();
  previewProduct.textContent = data.product;
  previewWeight.textContent = data.weight;
  previewQty.textContent = data.qty;
  packedDate.textContent = data.packedOn;
  packedDateInput.disabled = state.packedDateMode !== "custom";
  packedDateInput.value = state.packedDateMode === "custom" ? state.packedDateValue : formatDateInputValue(new Date());
  packedDateToggle.textContent = state.packedDateMode === "custom" ? "Use today" : "Custom date";
  packedDateToggle.classList.toggle("is-active", state.packedDateMode === "custom");
  const copies = normaliseCopies();
  copySummary.textContent = `${copies} ${copies === 1 ? "copy" : "copies"}`;
}

function labelMarkup(data, className = "print-label") {
  return `
    <section class="${className}">
      <div class="label-product">${escapeHtml(data.product)}</div>
      <div class="label-meta">
        <div>
          <span>WEIGHT</span>
          <strong>${escapeHtml(data.weight)}</strong>
        </div>
        <div>
          <span>QTY</span>
          <strong>${escapeHtml(data.qty)}</strong>
        </div>
      </div>
      <div class="packed-row">
        <span>PACKED ON</span>
        <strong>${escapeHtml(data.packedOn)}</strong>
      </div>
    </section>
  `;
}

async function printLabels() {
  if (!state.selectedProduct) {
    productSearch.focus();
    return;
  }

  const copies = normaliseCopies();
  const data = currentLabelData();
  if (localPrintAvailable) {
    printButton.disabled = true;
    printButton.textContent = "Printing...";
    try {
      const response = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copies, label: data, settings: readSettingsForm() })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.stderr || result.error || "Print failed");
      }
      if (settingsStatus) settingsStatus.textContent = "Print job sent.";
    } catch (error) {
      window.alert(`Print failed: ${error.message}`);
    } finally {
      printButton.disabled = false;
      printButton.textContent = "Print";
    }
    return;
  }

  printArea.innerHTML = Array.from({ length: copies }, () => labelMarkup(data)).join("");
  window.print();
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function readSettingsForm() {
  return {
    printer: printerSelect?.value || "",
    preset: presetInput?.value.trim() || "",
    media: mediaInput?.value.trim() || "",
    orientation: orientationSelect?.value || "portrait",
    fitToPage: Boolean(fitToPageInput?.checked),
    rawOptions: rawOptionsInput?.value.trim() || ""
  };
}

function writeSettingsForm(settings) {
  printSettings = { ...printSettings, ...settings };
  if (presetInput) presetInput.value = printSettings.preset || "";
  if (mediaInput) mediaInput.value = printSettings.media || "Custom.100x48mm";
  if (orientationSelect) orientationSelect.value = printSettings.orientation || "portrait";
  if (fitToPageInput) fitToPageInput.checked = printSettings.fitToPage !== false;
  if (rawOptionsInput) rawOptionsInput.value = printSettings.rawOptions || "";
  if (printerSelect) printerSelect.value = printSettings.printer || "";
}

async function loadPrinters() {
  if (!printerSelect) return;
  const printerData = await requestJson("/api/printers");
  const currentPrinter = printSettings.printer || printerData.defaultPrinter || "";
  printerSelect.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = printerData.defaultPrinter
    ? `System default (${printerData.defaultPrinter})`
    : "System default";
  printerSelect.append(defaultOption);

  printerData.printers.forEach((printer) => {
    const option = document.createElement("option");
    option.value = printer;
    option.textContent = printer;
    printerSelect.append(option);
  });

  printerSelect.value = currentPrinter;
  if (settingsStatus) {
    settingsStatus.textContent = printerData.error || "";
  }
}

async function initialiseLocalPrint() {
  if (!settingsButton) return;
  try {
    printSettings = await requestJson("/api/settings");
    localPrintAvailable = true;
    settingsButton.hidden = false;
    writeSettingsForm(printSettings);
    await loadPrinters();
  } catch (error) {
    localPrintAvailable = false;
  }
}

async function savePrintSettings() {
  try {
    printSettings = await requestJson("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(readSettingsForm())
    });
    writeSettingsForm(printSettings);
    if (settingsStatus) settingsStatus.textContent = "Settings saved.";
  } catch (error) {
    if (settingsStatus) settingsStatus.textContent = `Could not save settings: ${error.message}`;
  }
}

function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
      const [first, second] = cells;
      if (!second && first) return { code: `IMP-${String(index + 1).padStart(3, "0")}`, name: first };
      return { code: first || `IMP-${String(index + 1).padStart(3, "0")}`, name: second || first };
    })
    .filter((product) => product.name && product.name.toLowerCase() !== "name");
}

productImport.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const importedProducts = parseCsv(await file.text());
  if (!importedProducts.length) return;
  products.splice(0, products.length, ...importedProducts);
  state.selectedProduct = products[0];
  productSearch.value = "";
  renderProducts();
  renderPreview();
});

productSearch.addEventListener("input", renderProducts);

keypadTargets.forEach((input) => {
  input.addEventListener("click", () => setActiveInput(input.id));
});

unitButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.unit = button.dataset.unit;
    unitButtons.forEach((unitButton) => {
      unitButton.classList.toggle("is-active", unitButton === button);
    });
    renderPreview();
  });
});

packedDateToggle.addEventListener("click", () => {
  if (state.packedDateMode === "custom") {
    state.packedDateMode = "today";
  } else {
    state.packedDateMode = "custom";
    state.packedDateValue = packedDateInput.value || formatDateInputValue(new Date());
  }
  renderPreview();
});

packedDateInput.addEventListener("change", () => {
  state.packedDateValue = packedDateInput.value || formatDateInputValue(new Date());
  renderPreview();
});

keypad.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button === printButton) return;
  if (button.dataset.key) applyKey(button.dataset.key);
  if (button.dataset.action) applyAction(button.dataset.action);
});

printButton.addEventListener("click", printLabels);

settingsButton?.addEventListener("click", async () => {
  await loadPrinters();
  if (settingsDialog?.showModal) {
    settingsDialog.showModal();
  }
});

settingsCloseButton?.addEventListener("click", () => {
  settingsDialog?.close();
});

saveSettingsButton?.addEventListener("click", savePrintSettings);

setActiveInput(state.activeInput);
renderProducts();
renderPreview();
initialiseLocalPrint();
