// Renderable bottom-sheet for "Add to list" pattern. Themable, persists to localStorage.
window.ProtoKit = window.ProtoKit || {};

ProtoKit.init = function(config){
  ProtoKit.config = Object.assign({
    swatches: ["#e50914","#7c3aed","#0ea5e9","#22c55e","#f59e0b","#ec4899"],
    sheetTitle: "Add to list",
    actionLabel: "Add to list",
    createLabel: "Create new list",
    newListLabel: "List name",
    newListPlaceholder: "e.g. My collection",
    unit: "items"
  }, config);

  ProtoKit.state.init();
  document.documentElement.style.setProperty("--brand", config.brand.color);

  injectSheet();

  const trigger = document.getElementById("addToListBtn");
  if(trigger) trigger.addEventListener("click", ProtoKit.openSheet);

  ProtoKit.updateActionLabel();
};

function escapeHTML(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function initial(name){ return name.trim().charAt(0).toUpperCase() || "L"; }

function injectSheet(){
  const cfg = ProtoKit.config;
  const phone = document.querySelector(".phone");
  if(!phone) return;

  const swatchHTML = cfg.swatches.map((c,i) =>
    `<button type="button" class="sw${i===0?' active':''}" data-color="${c}" style="background:${c}"></button>`
  ).join("");

  phone.insertAdjacentHTML("beforeend", `
    <div class="scrim" data-action="close-sheet"></div>
    <div class="sheet" id="protoSheet">
      <div class="grabber"></div>
      <div class="sh-head">
        <div>
          <div class="sh-title">${escapeHTML(cfg.sheetTitle)}</div>
          <div class="sh-sub">${escapeHTML(cfg.item.title)}</div>
        </div>
        <button type="button" class="sh-close" data-action="close-sheet" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="sh-body" id="protoSheetBody"></div>
      <div class="create-form" id="protoCreateForm">
        <label>${escapeHTML(cfg.newListLabel)}</label>
        <div class="input-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h16"/></svg>
          <input id="protoNewListName" placeholder="${escapeHTML(cfg.newListPlaceholder)}" maxlength="40" autocomplete="off" />
        </div>
        <div class="swatch-picker" id="protoSwatchPicker">${swatchHTML}</div>
        <div class="create-actions">
          <button type="button" class="btn ghost" data-action="cancel-create">Cancel</button>
          <button type="button" class="btn primary" data-action="save-new-list">Create &amp; add</button>
        </div>
      </div>
      <div class="sheet-foot">
        <span class="selsum" id="protoSelSum">Not in any list</span>
        <button type="button" class="done" data-action="close-sheet">Done</button>
      </div>
    </div>
    <div class="toast" id="protoToast">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
      <span id="protoToastText">Added</span>
    </div>
  `);

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if(!el) return;
    const a = el.dataset.action;
    if(a === "close-sheet") ProtoKit.closeSheet();
    else if(a === "cancel-create") cancelCreate();
    else if(a === "save-new-list") saveNewList();
  });

  document.getElementById("protoSwatchPicker").addEventListener("click", (e) => {
    const sw = e.target.closest(".sw"); if(!sw) return;
    document.querySelectorAll("#protoSwatchPicker .sw").forEach(n => n.classList.remove("active"));
    sw.classList.add("active");
    ProtoKit.state.get().selectedSwatch = sw.dataset.color;
  });

  document.querySelector(".create-form .input-wrap")
    .addEventListener("click", () => document.getElementById("protoNewListName").focus());
  document.getElementById("protoNewListName")
    .addEventListener("keydown", (e) => { if(e.key === "Enter"){ e.preventDefault(); saveNewList(); } });
}

function render(){
  const state = ProtoKit.state.get();
  const cfg = ProtoKit.config;
  const body = document.getElementById("protoSheetBody");
  body.innerHTML = "";

  const ordered = [...state.lists].sort((a,b) => (b.isDefault?1:0) - (a.isDefault?1:0));
  const mem = state.membership[cfg.item.id];

  ordered.forEach((list) => {
    const inList = mem.includes(list.id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "list-row" + (inList ? " selected" : "");
    row.dataset.id = list.id;
    row.setAttribute("aria-pressed", inList ? "true" : "false");
    row.innerHTML = `
      <div class="swatch" style="background:${list.color}">${initial(list.name)}</div>
      <div class="info">
        <div class="name">
          ${escapeHTML(list.name)}
          ${list.isDefault ? '<span class="pill">DEFAULT</span>' : ''}
        </div>
        <div class="count">${list.count + (inList?1:0)} ${escapeHTML(cfg.unit)}${inList ? ' · including this' : ''}</div>
      </div>
      <div class="check">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
      </div>
    `;
    row.addEventListener("click", () => toggleList(list.id));
    body.appendChild(row);

    if(list.isDefault){
      const div = document.createElement("div");
      div.className = "sh-divider";
      body.appendChild(div);
    }
  });

  const create = document.createElement("button");
  create.type = "button";
  create.className = "create-row";
  create.innerHTML = `
    <div class="plus">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </div>
    <div class="lbl">${escapeHTML(cfg.createLabel)}</div>
  `;
  create.addEventListener("click", showCreateForm);
  body.appendChild(create);

  updateSummary();
  ProtoKit.updateActionLabel();
}

function toggleList(listId){
  const state = ProtoKit.state.get();
  const cfg = ProtoKit.config;
  const arr = state.membership[cfg.item.id];
  const i = arr.indexOf(listId);
  let added;
  if(i === -1){ arr.push(listId); added = true; }
  else { arr.splice(i,1); added = false; }
  ProtoKit.state.saveMembership();
  render();
  const list = state.lists.find(l => l.id === listId);
  showToast(added ? `Added to ${list.name}` : `Removed from ${list.name}`);
}

function updateSummary(){
  const state = ProtoKit.state.get();
  const arr = state.membership[ProtoKit.config.item.id];
  const sum = document.getElementById("protoSelSum");
  if(arr.length === 0){ sum.textContent = "Not in any list"; return; }
  const names = arr.map(id => state.lists.find(l => l.id === id)?.name).filter(Boolean);
  sum.textContent = "In: " + names.join(" · ");
}

ProtoKit.updateActionLabel = function(){
  const state = ProtoKit.state.get();
  const arr = state.membership[ProtoKit.config.item.id];
  const lbl = document.getElementById("addToListLbl");
  const btn = document.getElementById("addToListBtn");
  if(!lbl || !btn) return;
  const icon = btn.querySelector(".icon svg");
  if(arr.length){
    lbl.textContent = arr.length === 1 ? "In 1 list" : `In ${arr.length} lists`;
    btn.classList.add("active");
    if(icon) icon.innerHTML = '<path d="M5 12l5 5L20 7" />';
  }else{
    lbl.textContent = ProtoKit.config.actionLabel;
    btn.classList.remove("active");
    if(icon) icon.innerHTML = '<path d="M12 5v14M5 12h14"/>';
  }
};

function showCreateForm(){
  document.getElementById("protoCreateForm").classList.add("show");
  setTimeout(() => document.getElementById("protoNewListName").focus(), 50);
}
function cancelCreate(){
  document.getElementById("protoCreateForm").classList.remove("show");
  document.getElementById("protoNewListName").value = "";
}
function saveNewList(){
  const name = document.getElementById("protoNewListName").value.trim();
  if(!name){ document.getElementById("protoNewListName").focus(); return; }
  const state = ProtoKit.state.get();
  const id = "list-" + Date.now();
  const list = { id, name, isDefault: false, color: state.selectedSwatch, count: 0 };
  state.lists.push(list);
  state.membership[ProtoKit.config.item.id].push(id);
  ProtoKit.state.saveLists();
  ProtoKit.state.saveMembership();
  cancelCreate();
  render();
  showToast(`Created “${name}” and added`);
}

let toastT;
function showToast(text){
  const t = document.getElementById("protoToast");
  document.getElementById("protoToastText").textContent = text;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 1700);
}

ProtoKit.openSheet = function(){
  document.querySelector(".scrim").classList.add("show");
  document.getElementById("protoSheet").classList.add("show");
  document.getElementById("protoCreateForm").classList.remove("show");
  render();
};
ProtoKit.closeSheet = function(){
  document.querySelector(".scrim").classList.remove("show");
  document.getElementById("protoSheet").classList.remove("show");
};
