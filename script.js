const PEOPLE = ["Linh", "Trang", "Vương"];
const STORAGE_KEY = "bill-splitter-state-v1";

const state = {
  people: {},
  selectedDebt: null,
};

function makeGroup(id, title, kind, target = null) {
  return { id, title, kind, target, rows: [{ name: "", price: "" }] };
}

function groupsFor(payer) {
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
    state.people[person] = { groups: groupsFor(person) };
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved?.people) return false;

    initState();
    PEOPLE.forEach(person => {
      const savedGroups = saved.people?.[person]?.groups || [];
      state.people[person].groups.forEach(group => {
        const old = savedGroups.find(g => g.id === group.id);
        if (!old || !Array.isArray(old.rows)) return;
        group.rows = old.rows.map(row => ({
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

function groupTotal(group) {
  return group.rows.reduce((sum, row) => sum + parseMoney(row.price), 0);
}

function groupShare(group) {
  const total = groupTotal(group);
  if (group.kind === "split3") return total / 3;
  if (group.kind === "split2") return total / 2;
  return total;
}

function normalizeRows(group) {
  const filled = group.rows.filter(row => row.name.trim() !== "" || parseMoney(row.price) > 0);
  group.rows = [...filled, { name: "", price: "" }];
}

function renderPeople() {
  const grid = document.getElementById("peopleGrid");
  grid.innerHTML = "";

  PEOPLE.forEach(person => {
    const panel = document.createElement("article");
    panel.className = "person-panel";
    panel.dataset.person = person;
    panel.innerHTML = `
      <div class="person-head">
        <h2 class="person-title">${person} đã chi</h2>
        <span class="person-chip">${person}</span>
      </div>
      <div class="groups-stack"></div>
    `;

    const stack = panel.querySelector(".groups-stack");
    state.people[person].groups.forEach(group => stack.appendChild(renderGroup(person, group)));
    grid.appendChild(panel);
  });
}

function renderGroup(person, group) {
  const tpl = document.getElementById("groupTemplate");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.person = person;
  node.dataset.group = group.id;
  node.querySelector(".group-title").textContent = group.title;

  renderRowsInto(node.querySelector(".expense-rows"), person, group, node);
  updateGroupSummary(node, group);
  return node;
}

function renderRowsInto(rowsEl, person, group, groupNode, preferredIndex = null, preferredField = null) {
  rowsEl.innerHTML = "";
  group.rows.forEach((row, index) => {
    const rowEl = document.createElement("div");
    rowEl.className = "expense-row";
    rowEl.innerHTML = `
      <input class="name-input" type="text" autocomplete="off" placeholder="Tên khoản" value="${escapeHtml(row.name)}">
      <input class="price-input" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${escapeHtml(formatInput(row.price))}">
    `;

    const nameInput = rowEl.querySelector(".name-input");
    const priceInput = rowEl.querySelector(".price-input");

    nameInput.addEventListener("input", e => {
      group.rows[index].name = e.target.value;
      normalizeRows(group);
      renderRowsInto(rowsEl, person, group, groupNode, index, "name");
      updateAllCalculations();
      saveState();
    });

    priceInput.addEventListener("input", e => {
      group.rows[index].price = e.target.value;
      normalizeRows(group);
      renderRowsInto(rowsEl, person, group, groupNode, index, "price");
      updateAllCalculations();
      saveState();
    });

    rowsEl.appendChild(rowEl);
  });

  if (preferredIndex !== null) {
    const focusIndex = Math.min(preferredIndex, group.rows.length - 1);
    const targetRow = rowsEl.children[focusIndex];
    const target = targetRow?.querySelector(preferredField === "price" ? ".price-input" : ".name-input");
    if (target) {
      target.focus();
      const len = target.value.length;
      target.setSelectionRange(len, len);
    }
  }
}

function updateGroupSummary(groupNode, group) {
  const total = groupTotal(group);
  const share = groupShare(group);
  groupNode.querySelector(".sum-total").textContent = formatMoney(total);

  const shareLabel = groupNode.querySelector(".share-label");
  const shareValue = groupNode.querySelector(".sum-share");

  if (group.kind === "advance") {
    shareLabel.textContent = `${group.target} trả`;
    shareValue.textContent = formatMoney(total);
  } else {
    shareLabel.textContent = "Mỗi người";
    shareValue.textContent = formatMoney(share);
  }
}

// Công nợ thô: debtor -> receiver.
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
      let owedPerDebtor = total;

      if (group.kind === "split3") {
        debtors = PEOPLE.filter(p => p !== payer);
        owedPerDebtor = total / 3;
      } else if (group.kind === "split2") {
        debtors = [group.target];
        owedPerDebtor = total / 2;
      } else {
        debtors = [group.target];
      }

      debtors.forEach(debtor => {
        debts[debtor][payer] += owedPerDebtor;
        grouped[debtor][payer].push({
          groupTitle: group.title,
          amount: owedPerDebtor,
        });
      });
    });
  });

  return { debts, grouped };
}

// Chỉ đối trừ trực tiếp theo từng cặp, không bù trừ qua người thứ ba.
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
      const aToB = raw.debts[a][b];
      const bToA = raw.debts[b][a];
      const diff = aToB - bToA;
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

  thead.innerHTML = `<tr><th class="axis-cell">Người trả ↓ / Người nhận →</th>${PEOPLE.map(p => `<th>${p}</th>`).join("")}</tr>`;
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
          td.textContent = formatMoney(value);
          if (state.selectedDebt?.debtor === debtor && state.selectedDebt?.receiver === receiver) td.classList.add("active");
          td.addEventListener("click", () => {
            state.selectedDebt = { debtor, receiver };
            renderMatrix();
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

  if (state.selectedDebt) {
    const { debtor, receiver } = state.selectedDebt;
    if (data.net[debtor][receiver] > 0) renderDetails(debtor, receiver, data);
    else clearDetails(false);
  }
}

function collapseGroups(items) {
  const map = new Map();
  items.forEach(item => map.set(item.groupTitle, (map.get(item.groupTitle) || 0) + item.amount));
  return [...map.entries()]
    .map(([title, amount]) => ({ title, amount }))
    .filter(x => x.amount > 0.000001);
}

function detailRowsHtml(items, sign) {
  return items.map(item => `
    <div class="calc-row ${sign === "+" ? "positive" : "negative"}">
      <span class="calc-label">${escapeHtml(item.title)}</span>
      <span class="calc-amount">${sign}${formatMoney(item.amount)}</span>
    </div>
  `).join("");
}

function renderDetails(debtor, receiver, data) {
  const panel = document.getElementById("detailPanel");
  const plusItems = collapseGroups(data.raw.grouped[debtor][receiver]);
  const minusItems = collapseGroups(data.raw.grouped[receiver][debtor]);
  const total = data.net[debtor][receiver];

  panel.classList.remove("empty");
  panel.innerHTML = `
    <div class="detail-head">
      <h3>${debtor} trả ${receiver}</h3>
      <div class="detail-total">${formatMoney(total)}</div>
    </div>
    <div class="calc-body">
      <div class="calc-side">
        <div class="calc-side-title"><strong>${receiver} đã chi</strong><span>Cộng</span></div>
        ${detailRowsHtml(plusItems, "+")}
      </div>
      ${minusItems.length ? `
        <div class="calc-side subtract">
          <div class="calc-side-title"><strong>${debtor} đã chi</strong><span>Trừ</span></div>
          ${detailRowsHtml(minusItems, "-")}
        </div>
      ` : ""}
      <div class="calc-result">
        <span>Còn phải trả</span>
        <strong>${formatMoney(total)}</strong>
      </div>
    </div>
  `;
}

function clearDetails(resetSelection = true) {
  if (resetSelection) state.selectedDebt = null;
  const panel = document.getElementById("detailPanel");
  panel.className = "detail-panel empty";
  panel.innerHTML = `<div class="detail-placeholder">Chọn một ô có số tiền để xem chi tiết.</div>`;
}

function updateAllCalculations() {
  document.querySelectorAll(".expense-group").forEach(groupNode => {
    const person = groupNode.dataset.person;
    const groupId = groupNode.dataset.group;
    const group = state.people[person].groups.find(g => g.id === groupId);
    if (group) updateGroupSummary(groupNode, group);
  });
  renderMatrix();
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
  const hasData = PEOPLE.some(person =>
    state.people[person].groups.some(group =>
      group.rows.some(row => row.name.trim() !== "" || parseMoney(row.price) > 0)
    )
  );
  if (hasData && !confirm("Xóa toàn bộ dữ liệu đang nhập?")) return;

  localStorage.removeItem(STORAGE_KEY);
  state.selectedDebt = null;
  initState();
  renderPeople();
  renderMatrix();
  clearDetails();
}

document.getElementById("resetBtn").addEventListener("click", resetAll);

if (!loadState()) initState();
renderPeople();
renderMatrix();
