const PEOPLE = ["Linh", "Trang", "Vương"];
const STORAGE_KEY = "bill-splitter-v2";

const state = {
  people: {},
  editing: null,
  detailMode: null, // null | "all" | "single"
  selectedDebt: null,
};

function makeGroup(id, title, kind, target = null) {
  return { id, title, kind, target, rows: [{ name: "", price: "" }] };
}

function groupDefinitionsFor(payer) {
  const others = PEOPLE.filter(p => p !== payer);
  return [
    makeGroup("split3", "Chia cho 3", "split3"),
    makeGroup(`split-${others[0]}`, `Chia với ${others[0]}`, "split2", others[0]),
    makeGroup(`advance-${others[0]}`, `Ứng tiền cho ${others[0]}`, "advance", others[0]),
    makeGroup(`split-${others[1]}`, `Chia với ${others[1]}`, "split2", others[1]),
    makeGroup(`advance-${others[1]}`, `Ứng tiền cho ${others[1]}`, "advance", others[1]),
  ];
}

function initState() {
  state.people = {};
  PEOPLE.forEach(person => {
    state.people[person] = { groups: groupDefinitionsFor(person) };
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    initState();
    PEOPLE.forEach(person => {
      const savedGroups = saved?.people?.[person]?.groups || [];
      state.people[person].groups.forEach(group => {
        const previous = savedGroups.find(g => g.id === group.id);
        if (!previous?.rows) return;
        group.rows = previous.rows.map(row => ({
          name: String(row?.name ?? ""),
          price: String(row?.price ?? ""),
        }));
        normalizeRows(group);
      });
    });
    return true;
  } catch (error) {
    console.warn("Không thể đọc dữ liệu đã lưu:", error);
    return false;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ people: state.people }));
  } catch (error) {
    console.warn("Không thể lưu dữ liệu:", error);
  }
}

function parseMoney(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatInput(value) {
  const amount = parseMoney(value);
  return amount ? amount.toLocaleString("vi-VN") : "";
}

function formatMoney(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.000001) return "—";
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString("vi-VN", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function normalizeRows(group) {
  const filled = group.rows.filter(row => row.name.trim() !== "" || parseMoney(row.price) > 0);
  group.rows = [...filled, { name: "", price: "" }];
}

function groupTotal(group) {
  return group.rows.reduce((sum, row) => sum + parseMoney(row.price), 0);
}

function groupShare(group) {
  const total = groupTotal(group);
  if (group.kind === "split3") return total / 3;
  if (group.kind === "split2") return total / 2;
  return total;
}

function isGroupActive(group) {
  return groupTotal(group) > 0 || group.rows.some(row => row.name.trim() !== "");
}

function findGroup(person, groupId) {
  return state.people[person].groups.find(group => group.id === groupId);
}

function renderApp() {
  renderPeople();
  renderMatrix();
  renderDetailsByMode();
}

function renderPeople() {
  const grid = document.getElementById("peopleGrid");
  grid.innerHTML = "";

  const columns = [];
  const trays = [];

  PEOPLE.forEach(person => {
    const column = document.createElement("div");
    column.className = "person-column";
    column.dataset.person = person;

    const tpl = document.getElementById("personTemplate");
    const panel = tpl.content.firstElementChild.cloneNode(true);
    panel.dataset.person = person;
    panel.querySelector(".person-title").textContent = `Chi của ${person}`;

    const activeContainer = panel.querySelector(".active-groups");
    const groups = state.people[person].groups;

    // Chỉ group có dữ liệu (hoặc đang được nhập) mới nằm trong card chính.
    const activeGroups = groups.filter(group =>
      isGroupActive(group) || (state.editing?.person === person && state.editing?.groupId === group.id)
    );
    const inactiveGroups = groups.filter(group => !activeGroups.includes(group));

    activeGroups.forEach(group => activeContainer.appendChild(renderGroup(person, group)));
    column.appendChild(panel);

    // Khay thêm khoản chỉ hiện nút "...". Bấm vào mới xổ các lựa chọn.
    // Khay vẫn được căn xuống cùng một cao độ với hai cột còn lại.
    if (inactiveGroups.length) {
      const tray = document.createElement("div");
      tray.className = "type-tray type-adder-wrap";
      tray.dataset.person = person;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "type-tray-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `<span class="type-tray-more" aria-hidden="true">...</span>`;
      toggle.setAttribute("aria-label", "Thêm khoản");

      const menu = document.createElement("div");
      menu.className = "type-menu";
      menu.hidden = true;

      inactiveGroups.forEach(group => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "type-option";
        btn.textContent = group.title;
        btn.title = group.title;
        btn.addEventListener("click", e => {
          e.stopPropagation();
          state.editing = {
            person,
            groupId: group.id,
            rowIndex: group.rows.length - 1,
            isNew: true,
          };
          renderPeople();
          requestAnimationFrame(() => focusActiveEditor(person, group.id));
        });
        menu.appendChild(btn);
      });

      toggle.addEventListener("click", e => {
        e.stopPropagation();

        // Chỉ mở một menu tại một thời điểm.
        document.querySelectorAll(".type-menu").forEach(otherMenu => {
          if (otherMenu !== menu) {
            otherMenu.hidden = true;
            otherMenu.closest(".type-adder-wrap")
              ?.querySelector(".type-tray-toggle")
              ?.setAttribute("aria-expanded", "false");
          }
        });

        menu.hidden = !menu.hidden;
        toggle.setAttribute("aria-expanded", String(!menu.hidden));
      });

      tray.append(toggle, menu);
      column.appendChild(tray);
      trays.push({ column, panel, tray });
    }

    columns.push({ column, panel });
    grid.appendChild(column);
  });

  // Đẩy tất cả các khay xuống dưới card cao nhất, để 3 khay luôn thẳng hàng.
  requestAnimationFrame(() => {
    const maxPanelHeight = Math.max(...columns.map(({ panel }) => panel.offsetHeight));
    trays.forEach(({ panel, tray }) => {
      const gap = 7;
      tray.style.marginTop = `${Math.max(gap, maxPanelHeight - panel.offsetHeight + gap)}px`;
    });
  });
}

function renderGroup(person, group) {
  const tpl = document.getElementById("groupTemplate");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.person = person;
  node.dataset.group = group.id;
  node.querySelector(".group-title").textContent = group.title;

  renderGroupSummary(node, group);
  renderRowsInto(node.querySelector(".expense-rows"), person, group, node);

  // Chỉ còn một dấu + ở cạnh tiêu đề nhóm, không còn dòng "+ Thêm khoản..." lặp lại.
  node.querySelector(".group-add-btn").addEventListener("click", () => {
    state.editing = {
      person,
      groupId: group.id,
      rowIndex: group.rows.length - 1,
      isNew: true,
    };
    renderRowsInto(node.querySelector(".expense-rows"), person, group, node);
  });

  return node;
}

function renderGroupSummary(groupNode, group) {
  const total = groupTotal(group);
  const share = groupShare(group);

  groupNode.querySelector(".summary-total").textContent = formatMoney(total);

  const label = groupNode.querySelector(".summary-share-label");
  const value = groupNode.querySelector(".summary-share");

  if (group.kind === "advance") {
    label.textContent = `${group.target} trả`;
    value.textContent = formatMoney(total);
  } else {
    label.textContent = "Mỗi người";
    value.textContent = formatMoney(share);
  }
}

function isEditing(person, groupId, rowIndex) {
  return state.editing &&
    state.editing.person === person &&
    state.editing.groupId === groupId &&
    state.editing.rowIndex === rowIndex;
}

function renderRowsInto(container, person, group, groupNode) {
  container.innerHTML = "";
  const visibleRows = group.rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => index < group.rows.length - 1 || isEditing(person, group.id, index));

  visibleRows.forEach(({ row, index }) => {
    container.appendChild(
      isEditing(person, group.id, index)
        ? renderEditorRow(person, group, index, groupNode)
        : renderDisplayRow(person, group, index, groupNode)
    );
  });
}

function renderDisplayRow(person, group, index, groupNode) {
  const row = group.rows[index];
  const el = document.createElement("div");
  el.className = "expense-row-display";
  el.tabIndex = 0;
  el.innerHTML = `
    <button class="row-delete" type="button" aria-label="Xóa khoản">×</button>
    <span class="expense-name">${escapeHtml(row.name || "Không tên")}</span>
    <span class="expense-price">${formatMoney(parseMoney(row.price))}</span>
  `;

  const startEdit = () => {
    state.editing = { person, groupId: group.id, rowIndex: index, isNew: false };
    renderRowsInto(groupNode.querySelector(".expense-rows"), person, group, groupNode);
  };

  el.addEventListener("click", e => {
    if (e.target.closest(".row-delete")) return;
    startEdit();
  });
  el.addEventListener("keydown", e => {
    if (e.key === "Enter") startEdit();
  });

  el.querySelector(".row-delete").addEventListener("click", e => {
    e.stopPropagation();
    group.rows.splice(index, 1);
    normalizeRows(group);
    state.editing = null;
    saveState();
    renderApp();
  });
  return el;
}

function renderEditorRow(person, group, index, groupNode) {
  const row = group.rows[index] || { name: "", price: "" };
  const original = { ...row };
  const isNew = state.editing?.isNew;
  const el = document.createElement("div");
  el.className = "expense-row-editor";
  el.innerHTML = `
    <div class="editor-actions">
      <button class="editor-cancel" type="button" title="Hủy">×</button>
      <button class="editor-save" type="button" title="Lưu">✓</button>
    </div>
    <input class="name-input" type="text" autocomplete="off" placeholder="Tên khoản" value="${escapeHtml(row.name)}">
    <input class="price-input" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${escapeHtml(formatInput(row.price))}">
  `;

  const nameInput = el.querySelector(".name-input");
  const priceInput = el.querySelector(".price-input");

  const syncDraft = () => {
    group.rows[index].name = nameInput.value;
    group.rows[index].price = priceInput.value;
    renderGroupSummary(groupNode, group);
    renderMatrix();
    renderDetailsByMode();
  };

  const commit = () => {
    syncDraft();
    normalizeRows(group);
    state.editing = null;
    saveState();
    renderApp();
  };

  const cancel = () => {
    if (isNew) group.rows[index] = { name: "", price: "" };
    else group.rows[index] = original;
    normalizeRows(group);
    state.editing = null;
    renderApp();
  };

  nameInput.addEventListener("input", syncDraft);
  priceInput.addEventListener("input", syncDraft);
  [nameInput, priceInput].forEach(input => {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") cancel();
    });
  });
  el.querySelector(".editor-save").addEventListener("click", commit);
  el.querySelector(".editor-cancel").addEventListener("click", cancel);

  requestAnimationFrame(() => {
    nameInput.focus();
    const len = nameInput.value.length;
    nameInput.setSelectionRange(len, len);
  });
  return el;
}

function focusActiveEditor(person, groupId) {
  const panel = document.querySelector(`.person-panel[data-person="${person}"]`);
  const groupNode = panel?.querySelector(`.expense-group[data-group="${CSS.escape(groupId)}"]`);
  groupNode?.querySelector(".name-input")?.focus();
}

function buildRawDebtData() {
  const debts = {};
  const grouped = {};
  PEOPLE.forEach(debtor => {
    debts[debtor] = {};
    grouped[debtor] = {};
    PEOPLE.forEach(receiver => {
      debts[debtor][receiver] = 0;
      grouped[debtor][receiver] = [];
    });
  });

  PEOPLE.forEach(payer => {
    state.people[payer].groups.forEach(group => {
      const total = groupTotal(group);
      if (total <= 0) return;

      let debtors = [];
      let owed = total;
      if (group.kind === "split3") {
        debtors = PEOPLE.filter(p => p !== payer);
        owed = total / 3;
      } else if (group.kind === "split2") {
        debtors = [group.target];
        owed = total / 2;
      } else {
        debtors = [group.target];
      }

      debtors.forEach(debtor => {
        debts[debtor][payer] += owed;
        grouped[debtor][payer].push({ groupTitle: group.title, amount: owed });
      });
    });
  });

  return { debts, grouped };
}

function buildNetDebtData() {
  const raw = buildRawDebtData();
  const net = {};
  PEOPLE.forEach(a => {
    net[a] = {};
    PEOPLE.forEach(b => net[a][b] = 0);
  });

  for (let i = 0; i < PEOPLE.length; i++) {
    for (let j = i + 1; j < PEOPLE.length; j++) {
      const a = PEOPLE[i];
      const b = PEOPLE[j];
      const diff = raw.debts[a][b] - raw.debts[b][a];
      if (diff > 0) net[a][b] = diff;
      if (diff < 0) net[b][a] = -diff;
    }
  }
  return { raw, net };
}

function renderMatrix() {
  const data = buildNetDebtData();
  const table = document.getElementById("resultMatrix");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  thead.innerHTML = `<tr><th class="axis-cell">Trả ↓ / Nhận →</th>${PEOPLE.map(p => `<th>${p}</th>`).join("")}</tr>`;
  tbody.innerHTML = "";

  PEOPLE.forEach(debtor => {
    const tr = document.createElement("tr");
    const head = document.createElement("th");
    head.className = "axis-cell";
    head.textContent = `${debtor} trả`;
    tr.appendChild(head);

    PEOPLE.forEach(receiver => {
      const td = document.createElement("td");
      td.className = "result-cell";
      if (debtor === receiver) {
        td.classList.add("diagonal");
        td.textContent = "•";
      } else {
        const value = data.net[debtor][receiver];
        if (value > 0) {
          td.classList.add("has-value");
          td.dataset.receiver = receiver;
          td.textContent = formatMoney(value);
          if (state.detailMode === "single" && state.selectedDebt?.debtor === debtor && state.selectedDebt?.receiver === receiver) {
            td.classList.add("active");
          }
          td.addEventListener("click", () => {
            state.detailMode = "single";
            state.selectedDebt = { debtor, receiver };
            renderMatrix();
            renderDetailsByMode();
            document.getElementById("resultTitleBtn").setAttribute("aria-expanded", "false");
          });
        } else {
          td.classList.add("empty-value");
          td.textContent = "—";
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function collapseGroups(items) {
  const map = new Map();
  items.forEach(item => map.set(item.groupTitle, (map.get(item.groupTitle) || 0) + item.amount));
  return [...map.entries()].map(([title, amount]) => ({ title, amount })).filter(x => x.amount > 0.000001);
}

function detailLines(items, sign) {
  return items.map(item => `
    <div class="detail-line">
      <span>${escapeHtml(item.title)}</span>
      <span class="amount">${sign}${formatMoney(item.amount)}</span>
    </div>
  `).join("");
}

function singleDetailHtml(debtor, receiver, data) {
  const plusItems = collapseGroups(data.raw.grouped[debtor][receiver]);
  const minusItems = collapseGroups(data.raw.grouped[receiver][debtor]);
  const total = data.net[debtor][receiver];

  return `
    <div class="detail-block">
      <div class="detail-block-title"><span>${debtor} trả ${receiver}</span><span>${formatMoney(total)}</span></div>
      <div class="detail-person" data-person="${receiver}">${receiver}</div>
      ${detailLines(plusItems, "+")}
      ${minusItems.length ? `
        <div class="detail-person" data-person="${debtor}">${debtor}</div>
        ${detailLines(minusItems, "−")}
      ` : ""}
      <div class="detail-total-row"><span>Còn phải trả</span><strong>${formatMoney(total)}</strong></div>
    </div>
  `;
}

function allDetailsHtml(data) {
  const blocks = [];
  PEOPLE.forEach(debtor => {
    PEOPLE.forEach(receiver => {
      if (debtor === receiver || data.net[debtor][receiver] <= 0) return;
      blocks.push(singleDetailHtml(debtor, receiver, data));
    });
  });
  return blocks.length ? blocks.join("") : `<div class="detail-line"><span>Chưa có khoản thanh toán.</span></div>`;
}

function renderDetailsByMode() {
  const panel = document.getElementById("detailPanel");
  const data = buildNetDebtData();

  if (!state.detailMode) {
    panel.classList.add("is-hidden");
    panel.innerHTML = "";
    return;
  }

  panel.classList.remove("is-hidden");
  if (state.detailMode === "all") {
    panel.innerHTML = allDetailsHtml(data);
  } else if (state.detailMode === "single" && state.selectedDebt) {
    const { debtor, receiver } = state.selectedDebt;
    if (data.net[debtor][receiver] > 0) panel.innerHTML = singleDetailHtml(debtor, receiver, data);
    else {
      state.detailMode = null;
      state.selectedDebt = null;
      panel.classList.add("is-hidden");
      panel.innerHTML = "";
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetAll() {
  const hasData = PEOPLE.some(person => state.people[person].groups.some(isGroupActive));
  if (hasData && !confirm("Xóa toàn bộ dữ liệu đang nhập?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state.editing = null;
  state.detailMode = null;
  state.selectedDebt = null;
  initState();
  renderApp();
}

document.getElementById("resetBtn").addEventListener("click", resetAll);

document.getElementById("resultTitleBtn").addEventListener("click", () => {
  if (state.detailMode === "all") {
    state.detailMode = null;
    state.selectedDebt = null;
    document.getElementById("resultTitleBtn").setAttribute("aria-expanded", "false");
  } else {
    state.detailMode = "all";
    state.selectedDebt = null;
    document.getElementById("resultTitleBtn").setAttribute("aria-expanded", "true");
  }
  renderMatrix();
  renderDetailsByMode();
});

document.addEventListener("click", e => {
  document.querySelectorAll(".type-menu").forEach(menu => {
    const wrap = menu.closest(".type-adder-wrap");
    if (!wrap?.contains(e.target)) {
      menu.hidden = true;
      wrap?.querySelector(".type-tray-toggle")?.setAttribute("aria-expanded", "false");
    }
  });
});

if (!loadState()) initState();
renderApp();
