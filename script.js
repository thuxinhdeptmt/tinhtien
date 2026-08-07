const PEOPLE = ["Linh", "Trang", "Vương"];

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
  PEOPLE.forEach(person => {
    state.people[person] = { groups: groupsFor(person) };
  });
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
    state.people[person].groups.forEach(group => {
      stack.appendChild(renderGroup(person, group));
    });

    grid.appendChild(panel);
  });
}

function createRowElement(person, group, groupNode, row, index) {
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
    refreshGroupRows(person, group, groupNode, index, "name");
    updateAllCalculations();
  });

  priceInput.addEventListener("input", e => {
    const formatted = formatInput(e.target.value);
    group.rows[index].price = formatted;
    e.target.value = formatted;
    normalizeRows(group);
    refreshGroupRows(person, group, groupNode, index, "price");
    updateAllCalculations();
  });

  return rowEl;
}

function renderGroup(person, group) {
  const tpl = document.getElementById("groupTemplate");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.person = person;
  node.dataset.group = group.id;

  node.querySelector(".group-title").textContent = group.title;

  const rowsEl = node.querySelector(".expense-rows");
  group.rows.forEach((row, index) => {
    rowsEl.appendChild(createRowElement(person, group, node, row, index));
  });

  updateGroupSummary(node, group);
  return node;
}

function refreshGroupRows(person, group, groupNode, preferredIndex, preferredField) {
  const rowsEl = groupNode.querySelector(".expense-rows");
  rowsEl.innerHTML = "";

  group.rows.forEach((row, index) => {
    rowsEl.appendChild(createRowElement(person, group, groupNode, row, index));
  });

  const focusIndex = Math.min(preferredIndex, group.rows.length - 1);
  const targetRow = rowsEl.children[focusIndex];
  if (targetRow) {
    const target = targetRow.querySelector(preferredField === "price" ? ".price-input" : ".name-input");
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

  if (group.kind === "split3" || group.kind === "split2") {
    shareLabel.textContent = "Mỗi người";
    shareValue.textContent = formatMoney(share);
  } else {
    shareLabel.textContent = `${group.target} trả`;
    shareValue.textContent = formatMoney(total);
  }
}

function buildRawDebtData() {
  const debts = {};
  const details = {};

  PEOPLE.forEach(debtor => {
    debts[debtor] = {};
    details[debtor] = {};
    PEOPLE.forEach(receiver => {
      debts[debtor][receiver] = 0;
      details[debtor][receiver] = [];
    });
  });

  PEOPLE.forEach(payer => {
    state.people[payer].groups.forEach(group => {
      const filledRows = group.rows.filter(row => parseMoney(row.price) > 0);
      if (!filledRows.length) return;

      let debtors = [];
      let divisor = 1;

      if (group.kind === "split3") {
        debtors = PEOPLE.filter(p => p !== payer);
        divisor = 3;
      } else if (group.kind === "split2") {
        debtors = [group.target];
        divisor = 2;
      } else {
        debtors = [group.target];
      }

      debtors.forEach(debtor => {
        const lines = filledRows.map(row => {
          const raw = parseMoney(row.price);
          return {
            name: row.name.trim() || "Khoản không tên",
            original: raw,
            owed: raw / divisor,
          };
        });

        const subtotal = lines.reduce((sum, x) => sum + x.owed, 0);
        debts[debtor][payer] += subtotal;
        details[debtor][payer].push({
          payer,
          groupTitle: group.title,
          lines,
          subtotal,
        });
      });
    });
  });

  return { debts, details };
}

function buildNetDebtData() {
  const raw = buildRawDebtData();
  const netDebts = {};

  PEOPLE.forEach(person => {
    netDebts[person] = {};
    PEOPLE.forEach(other => {
      netDebts[person][other] = 0;
    });
  });

  for (let i = 0; i < PEOPLE.length; i++) {
    for (let j = i + 1; j < PEOPLE.length; j++) {
      const a = PEOPLE[i];
      const b = PEOPLE[j];
      const aToB = raw.debts[a][b];
      const bToA = raw.debts[b][a];
      const diff = aToB - bToA;

      if (diff > 0) netDebts[a][b] = diff;
      if (diff < 0) netDebts[b][a] = Math.abs(diff);
    }
  }

  return { debts: netDebts, rawDebts: raw.debts, details: raw.details };
}

function renderMatrix() {
  const data = buildNetDebtData();
  const { debts } = data;
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
        const value = debts[debtor][receiver];
        if (value > 0) {
          td.classList.add("has-value");
          td.textContent = formatMoney(value);
          td.dataset.debtor = debtor;
          td.dataset.receiver = receiver;

          if (state.selectedDebt?.debtor === debtor && state.selectedDebt?.receiver === receiver) {
            td.classList.add("active");
          }

          td.addEventListener("click", () => {
            state.selectedDebt = { debtor, receiver };
            renderMatrix();
            renderDetails(debtor, receiver, data);
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
    if (debts[debtor][receiver] > 0) renderDetails(debtor, receiver, data);
    else clearDetails();
  }
}

function renderDetailGroups(groups) {
  return groups.map(group => `
    <div class="detail-group">
      <div class="detail-group-title">
        <span>${group.payer} đã chi · ${group.groupTitle}</span>
        <span>${formatMoney(group.subtotal)}</span>
      </div>
      ${group.lines.map(line => `
        <div class="detail-line">
          <span class="name">${escapeHtml(line.name)}</span>
          <span class="amount">${formatMoney(line.owed)}</span>
        </div>
      `).join("")}
    </div>
  `).join("");
}

function renderDetails(debtor, receiver, data) {
  const panel = document.getElementById("detailPanel");
  const total = data.debts[debtor][receiver];
  const forward = data.rawDebts[debtor][receiver];
  const reverse = data.rawDebts[receiver][debtor];
  const groups = data.details[debtor][receiver];

  panel.classList.remove("empty");
  panel.innerHTML = `
    <div class="detail-head">
      <h3>${debtor} trả ${receiver}</h3>
      <div class="detail-total">${formatMoney(total)}</div>
    </div>
    <div class="detail-body">
      ${renderDetailGroups(groups)}
      ${reverse > 0 ? `<div class="detail-net-note">Đã đối trừ trực tiếp ${formatMoney(reverse)} theo chiều ${receiver} → ${debtor}.</div>` : ""}
    </div>
  `;
}

function clearDetails() {
  state.selectedDebt = null;
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

  state.people = {};
  state.selectedDebt = null;
  initState();
  renderPeople();
  renderMatrix();
  clearDetails();
}

document.getElementById("resetBtn").addEventListener("click", resetAll);

initState();
renderPeople();
renderMatrix();
