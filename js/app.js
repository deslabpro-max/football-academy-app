// ===== App State =====
let state = {
  role: null,
  groups: [],
  currentGroupId: null,
  currentGroupName: '',
  children: [],
  allChildren: [],
  attendanceMap: {},
  guestAttendance: [],
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (tg) {
      tg.ready();
      tg.expand();
    }
  } catch(e) {}

  // Safety timeout — if init hangs more than 15s, show error
  const safetyTimer = setTimeout(() => {
    document.getElementById('auth-error-text').textContent = 'Сервер не отвечает. Попробуйте позже.';
    navigateTo('unauthorized');
  }, 15000);

  await init();
  clearTimeout(safetyTimer);
});

async function init() {
  const errText = document.getElementById('auth-error-text');
  const loadingP = document.querySelector('#loading p');
  try {
    if (loadingP) loadingP.textContent = 'Подключение...';
    const roleData = await api.getRole();
    if (loadingP) loadingP.textContent = 'Роль: ' + (roleData?.role || 'нет');
    state.role = roleData.role;

    if (state.role === 'admin' || state.role === 'coach') {
      if (loadingP) loadingP.textContent = 'Загрузка групп...';
      const groups = await api.getGroups();
      state.groups = groups || [];
    }

    if (loadingP) loadingP.textContent = 'Готово!';
    if (state.role === 'admin') {
      navigateTo('admin-dashboard');
      await loadAdminData();
    } else if (state.role === 'coach') {
      navigateTo('coach-groups');
      renderCoachGroups();
    } else if (state.role === 'parent') {
      await initParentDashboard();
    } else {
      if (errText) errText.textContent = 'Неизвестная роль: ' + state.role;
      navigateTo('unauthorized');
    }
  } catch (err) {
    if (err.message.includes('Unauthorized') || err.message.includes('403')) {
      navigateTo('unauthorized');
    } else if (err.message.includes('No Telegram user')) {
      if (errText) errText.textContent = 'Откройте приложение через Telegram бота.';
      navigateTo('unauthorized');
    } else {
      if (errText) errText.textContent = 'Ошибка: ' + err.message;
      navigateTo('unauthorized');
    }
  }
}

// ===== Navigation =====
function navigateTo(screenId) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    screen.style.display = screenId === 'loading' ? 'flex' : 'block';
  }
}

// ===== Toast =====
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.classList.add('hidden'), 300); }, 2500);
}

// ===== Modal =====
function showModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  const modal = document.getElementById(id);
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('visible'));
}
function closeModals() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => {
    m.classList.remove('visible');
    setTimeout(() => m.classList.add('hidden'), 300);
  });
}

// ===== Date Helpers =====
function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
function changeDate(delta) {
  const input = document.querySelector('.screen.active input[type="date"]');
  if (!input) return;
  const d = new Date(input.value);
  d.setDate(d.getDate() + delta);
  input.value = d.toISOString().split('T')[0];
}
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// =======================================================
//                  COACH SCREENS
// =======================================================

function renderCoachGroups() {
  const list = document.getElementById('groups-list');
  if (!state.groups.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9917;</div><h2>Нет групп</h2><p>Вы пока не привязаны ни к одной группе.</p></div>';
    return;
  }
  list.innerHTML = state.groups.map(g => `
    <div class="card" onclick="openAttendance('${g.id}', '${escHtml(g.name)}', 'coach')">
      <div class="card-title">${escHtml(g.name)}</div>
    </div>
  `).join('');
}

async function openAttendance(groupId, groupName, from) {
  state.currentGroupId = groupId;
  state.currentGroupName = groupName;
  const prefix = from === 'admin' ? 'admin-' : '';
  const screenId = from === 'admin' ? 'admin-attendance' : 'coach-attendance';
  document.getElementById(`${prefix}attendance-group-name`).textContent = groupName;
  const dateInput = document.getElementById(`${prefix}attendance-date`);
  dateInput.value = todayStr();
  navigateTo(screenId);
  try {
    const children = await api.getChildren(groupId);
    state.children = children || [];
    state.attendanceMap = {};
    state.children.forEach(c => { state.attendanceMap[c.id] = true; });
    state.guestAttendance = [];
    renderAttendanceList(prefix);
  } catch (err) { toast(err.message); }
}

function renderAttendanceList(prefix = '') {
  const listId = prefix ? 'admin-children-att-list' : 'children-list';
  const list = document.getElementById(listId);
  list.innerHTML = state.children.map(c => `
    <div class="attendance-item ${state.attendanceMap[c.id] ? 'present' : ''}" id="att-${c.id}">
      <span class="child-name">${escHtml(c.full_name)}</span>
      <label class="toggle">
        <input type="checkbox" ${state.attendanceMap[c.id] ? 'checked' : ''}
          onchange="toggleAttendance('${c.id}', this.checked)">
        <span class="slider"></span>
      </label>
    </div>
  `).join('');
}

function toggleAttendance(childId, present) {
  state.attendanceMap[childId] = present;
  const el = document.getElementById(`att-${childId}`);
  if (el) el.classList.toggle('present', present);
}

function toggleGuests() {
  const content = document.getElementById('guest-content');
  const icon = document.getElementById('guest-toggle');
  content.classList.toggle('hidden');
  icon.classList.toggle('open');
  if (!content.classList.contains('hidden') && !state.allChildren.length) loadAllChildren();
}

async function loadAllChildren() {
  try { state.allChildren = await api.getAllChildren() || []; } catch { }
}

function searchGuests() {
  const q = document.getElementById('guest-search').value.toLowerCase();
  if (q.length < 2) { document.getElementById('guest-results').innerHTML = ''; return; }
  const results = state.allChildren.filter(c =>
    c.group_id !== state.currentGroupId && c.full_name.toLowerCase().includes(q)
  ).slice(0, 10);
  document.getElementById('guest-results').innerHTML = results.map(c => {
    const added = state.guestAttendance.some(g => g.child_id === c.id);
    return `<div class="guest-item"><div class="child-info"><div>${escHtml(c.full_name)}</div><div class="group-tag">${escHtml(c.groups?.name || '')}</div></div><div class="guest-actions">${added ? '<span style="color:var(--accent)">Добавлен</span>' : `<button class="btn-small green" onclick="addGuest('${c.id}','makeup')">Отработка</button><button class="btn-small gray" onclick="addGuest('${c.id}','extra')">Доп.</button>`}</div></div>`;
  }).join('') || '<p style="color:var(--hint);padding:8px">Не найдено</p>';
}

function addGuest(childId, reason) {
  if (!state.guestAttendance.some(g => g.child_id === childId)) {
    state.guestAttendance.push({ child_id: childId, guest_reason: reason });
    toast(reason === 'makeup' ? 'Добавлен: отработка' : 'Добавлен: доп. тренировка');
    searchGuests();
  }
}

async function saveAttendance() {
  const dateInput = document.querySelector('.screen.active input[type="date"]');
  const date = dateInput.value;
  if (!date) { toast('Выберите дату'); return; }
  const btn = document.querySelector('.screen.active .btn-save');
  btn.disabled = true; btn.textContent = 'Сохранение...';
  try {
    const attendees = state.children.map(c => ({ child_id: c.id, full_name: c.full_name, present: !!state.attendanceMap[c.id] }));
    await api.submitAttendance(state.currentGroupId, state.currentGroupName, date, attendees);
    for (const guest of state.guestAttendance) {
      await api.submitGuestAttendance(guest.child_id, state.currentGroupId, date, guest.guest_reason);
    }
    toast('Сохранено!');
    if (tg) tg.HapticFeedback?.notificationOccurred('success');
  } catch (err) { toast(err.message); }
  finally { btn.disabled = false; btn.textContent = 'Сохранить'; }
}

// =======================================================
//                  ADMIN SCREENS
// =======================================================

async function loadAdminData() {
  try {
    if (!state.groups.length) state.groups = await api.getGroups() || [];
    renderAdminGroups();
    populateGroupSelects();
    document.getElementById('filter-month').value = currentMonth();
  } catch (err) {
    console.error('loadAdminData error:', err);
    toast(err.message);
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
  if (tabName === 'children') loadAdminChildren();
  if (tabName === 'journal') initJournal();
  if (tabName === 'sick') loadSickDays();
  if (tabName === 'billing') loadBilling();
  if (tabName === 'groups') renderAdminGroups();
}

function populateGroupSelects() {
  ['filter-group', 'filter-billing-group', 'filter-journal-group', 'input-child-group', 'edit-child-group'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id.startsWith('filter');
    el.innerHTML = (isFilter ? '<option value="">Все группы</option>' : '') +
      state.groups.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('');
  });
}

// ----- Groups -----
function renderAdminGroups() {
  const list = document.getElementById('admin-groups-list');
  list.innerHTML = state.groups.map(g => {
    const coaches = g.group_coaches || [];
    return `<div class="card"><div class="card-row"><div><div class="card-title">${escHtml(g.name)}</div><div class="coach-tags">${coaches.map(c => `<span class="coach-tag">Тренер: ${c.coach_telegram_id}</span>`).join('')}</div></div><div style="display:flex;gap:4px"><button class="btn-small green" onclick="openAddCoach('${g.id}','${escHtml(g.name)}')">+Тренер</button><button class="btn-small gray" onclick="openAttendance('${g.id}','${escHtml(g.name)}','admin')">Журнал</button></div></div></div>`;
  }).join('') || '<div class="empty-state"><div class="empty-icon">&#9917;</div><p>Групп пока нет</p></div>';
}

async function createGroup() {
  const name = document.getElementById('input-group-name').value.trim();
  if (!name) { toast('Введите название'); return; }
  try {
    await api.createGroup(name);
    closeModals(); document.getElementById('input-group-name').value = '';
    toast('Группа создана'); await loadAdminData();
  } catch (err) { toast(err.message); }
}

function openAddCoach(groupId, groupName) {
  state.currentGroupId = groupId;
  document.getElementById('coach-group-label').textContent = groupName;
  document.getElementById('input-coach-tg-id').value = '';
  showModal('modal-add-coach');
}

async function addCoach() {
  const coachId = document.getElementById('input-coach-tg-id').value.trim();
  if (!coachId) { toast('Введите Telegram ID тренера'); return; }
  try {
    await api.addCoach(state.currentGroupId, parseInt(coachId));
    closeModals(); toast('Тренер добавлен'); await loadAdminData();
  } catch (err) { toast(err.message); }
}

// ----- Children -----
async function loadAdminChildren() {
  const groupId = document.getElementById('filter-group').value;
  try {
    const children = groupId ? await api.getChildren(groupId) : await api.getAllChildren();
    renderAdminChildren(children || []);
  } catch (err) { toast(err.message); }
}

function renderAdminChildren(children) {
  const list = document.getElementById('admin-children-list');
  list.innerHTML = children.map(c => {
    const contact = c.parent_phone || c.parent_username || '';
    return `<div class="card"><div class="card-row"><div onclick="openEditChild('${c.id}')"><div class="card-title">${escHtml(c.full_name)}</div><div class="card-subtitle">${c.groups?.name || ''} | ${c.birth_year || ''}</div>${contact ? `<div class="contact-info">${escHtml(c.parent_name || '')} ${escHtml(contact)}</div>` : ''}</div><div style="display:flex;align-items:center;gap:8px"><button class="btn-small green" onclick="event.stopPropagation();openChildDashboardAdmin('${c.id}','${escHtml(c.full_name)}','admin-dashboard')">&#128202;</button><div class="badge-amount">${c.base_monthly_fee}&#8381;</div></div></div></div>`;
  }).join('') || '<div class="empty-state"><div class="empty-icon">&#128102;</div><p>Учеников пока нет</p></div>';
  state.adminChildren = children;
}

async function addChild() {
  const data = {
    group_id: document.getElementById('input-child-group').value,
    full_name: document.getElementById('input-child-name').value.trim(),
    birth_year: parseInt(document.getElementById('input-child-year').value) || null,
    parent_name: document.getElementById('input-parent-name').value.trim() || null,
    parent_phone: document.getElementById('input-parent-phone').value.trim() || null,
    parent_username: document.getElementById('input-parent-username').value.trim() || null,
    base_monthly_fee: parseInt(document.getElementById('input-base-fee').value) || 0,
    included_trainings: parseInt(document.getElementById('input-included').value) || 8,
    extra_training_fee: parseInt(document.getElementById('input-extra-fee').value) || 0,
  };
  if (!data.full_name || !data.group_id) { toast('Заполните имя и группу'); return; }
  try {
    await api.addChild(data);
    closeModals();
    ['input-child-name','input-child-year','input-parent-name','input-parent-phone','input-parent-username','input-base-fee','input-extra-fee'].forEach(id => document.getElementById(id).value = '');
    toast('Ученик добавлен'); await loadAdminChildren();
  } catch (err) { toast(err.message); }
}

function openEditChild(childId) {
  const c = state.adminChildren?.find(x => x.id === childId);
  if (!c) return;
  document.getElementById('edit-child-id').value = c.id;
  document.getElementById('edit-child-group').value = c.group_id;
  document.getElementById('edit-child-name').value = c.full_name;
  document.getElementById('edit-child-year').value = c.birth_year || '';
  document.getElementById('edit-parent-name').value = c.parent_name || '';
  document.getElementById('edit-parent-phone').value = c.parent_phone || '';
  document.getElementById('edit-parent-username').value = c.parent_username || '';
  document.getElementById('edit-base-fee').value = c.base_monthly_fee;
  document.getElementById('edit-included').value = c.included_trainings;
  document.getElementById('edit-extra-fee').value = c.extra_training_fee;
  showModal('modal-edit-child');
}

async function updateChild() {
  const data = {
    child_id: document.getElementById('edit-child-id').value,
    group_id: document.getElementById('edit-child-group').value,
    full_name: document.getElementById('edit-child-name').value.trim(),
    birth_year: parseInt(document.getElementById('edit-child-year').value) || null,
    parent_name: document.getElementById('edit-parent-name').value.trim() || null,
    parent_phone: document.getElementById('edit-parent-phone').value.trim() || null,
    parent_username: document.getElementById('edit-parent-username').value.trim() || null,
    base_monthly_fee: parseInt(document.getElementById('edit-base-fee').value) || 0,
    included_trainings: parseInt(document.getElementById('edit-included').value) || 8,
    extra_training_fee: parseInt(document.getElementById('edit-extra-fee').value) || 0,
  };
  try {
    await api.updateChild(data); closeModals();
    toast('Сохранено'); await loadAdminChildren();
  } catch (err) { toast(err.message); }
}

async function deactivateChild() {
  const childId = document.getElementById('edit-child-id').value;
  if (!confirm('Деактивировать ученика?')) return;
  try {
    await api.deactivateChild(childId); closeModals();
    toast('Деактивирован'); await loadAdminChildren();
  } catch (err) { toast(err.message); }
}

// ----- Sick Days -----
async function loadSickDays() {
  try {
    const sick = await api.getSickDays() || [];
    renderSickDays(sick);
    if (!state.allChildren.length) state.allChildren = await api.getAllChildren() || [];
    const sel = document.getElementById('input-sick-child');
    sel.innerHTML = state.allChildren.map(c =>
      `<option value="${c.id}">${escHtml(c.full_name)} (${c.groups?.name || ''})</option>`
    ).join('');
  } catch (err) { toast(err.message); }
}

function renderSickDays(sickDays) {
  const list = document.getElementById('admin-sick-list');
  list.innerHTML = sickDays.map(s => `
    <div class="card"><div class="card-row"><div><div class="card-title">${escHtml(s.children?.full_name || '?')}</div><div class="card-subtitle">${formatDate(s.start_date)} — ${formatDate(s.end_date)}</div></div><button class="btn-small red" onclick="deleteSickDay('${s.id}')">Удалить</button></div></div>
  `).join('') || '<div class="empty-state"><div class="empty-icon">&#127973;</div><p>Больничных нет</p></div>';
}

async function addSickDay() {
  const child_id = document.getElementById('input-sick-child').value;
  const start = document.getElementById('input-sick-start').value;
  const end = document.getElementById('input-sick-end').value;
  if (!child_id || !start || !end) { toast('Заполните все поля'); return; }
  if (end < start) { toast('Дата окончания должна быть позже начала'); return; }
  try {
    await api.addSickDay(child_id, start, end, 'sick');
    closeModals(); toast('Больничный добавлен'); await loadSickDays();
  } catch (err) { toast(err.message); }
}

async function deleteSickDay(id) {
  if (!confirm('Удалить запись о больничном?')) return;
  try { await api.deleteSickDay(id); toast('Удалено'); await loadSickDays(); }
  catch (err) { toast(err.message); }
}

// ----- Billing -----
async function loadBilling() {
  const monthInput = document.getElementById('filter-month').value;
  const groupId = document.getElementById('filter-billing-group').value;
  if (!monthInput) return;
  const month = monthInput + '-01';
  try {
    const bills = await api.getBilling(month, groupId || undefined) || [];
    renderBilling(bills);
  } catch (err) { toast(err.message); }
}

function renderBilling(bills) {
  const total = bills.reduce((s, b) => s + (b.total_amount || 0), 0);
  const paid = bills.filter(b => b.paid).reduce((s, b) => s + (b.total_amount || 0), 0);
  document.getElementById('billing-summary').innerHTML = `
    <div class="summary-item"><div class="label">Всего</div><div class="value">${total}&#8381;</div></div>
    <div class="summary-item"><div class="label">Оплачено</div><div class="value" style="color:#008637">${paid}&#8381;</div></div>
    <div class="summary-item"><div class="label">Долг</div><div class="value" style="color:#d32f2f">${total - paid}&#8381;</div></div>
  `;
  const list = document.getElementById('admin-billing-list');
  list.innerHTML = bills.map(b => {
    const child = b.children || {};
    return `<div class="card" onclick="openBillingDetail('${b.id}')"><div class="card-row"><div><div class="card-title">${escHtml(child.full_name || '?')}</div><div class="card-subtitle">${child.groups?.name || ''}</div></div><div style="text-align:right"><div class="badge-amount">${b.total_amount}&#8381;</div><span class="card-badge ${b.paid ? 'badge-paid' : 'badge-unpaid'}">${b.paid ? 'Оплачено' : 'Не оплачено'}</span></div></div></div>`;
  }).join('') || '<div class="empty-state"><div class="empty-icon">&#128176;</div><p>Нет записей за этот месяц</p></div>';
  state.billingData = bills;
}

function openBillingDetail(billingId) {
  const b = state.billingData?.find(x => x.id === billingId);
  if (!b) return;
  document.getElementById('billing-detail-name').textContent = b.children?.full_name || '?';
  let html = '<table class="detail-table">';
  html += `<tr><td>Абонемент</td><td>${b.base_fee}&#8381;</td></tr>`;
  html += `<tr><td>Тренировок (своя группа)</td><td>${b.total_trainings}</td></tr>`;
  html += `<tr><td>Включено в абонемент</td><td>${b.included_trainings}</td></tr>`;
  if (b.extra_trainings > 0) html += `<tr><td>Дополнительные</td><td>+${b.extra_fee}&#8381;</td></tr>`;
  if (b.guest_extra_trainings > 0) html += `<tr><td>Гостевые (доп., платные)</td><td>${b.guest_extra_trainings}</td></tr>`;
  if (b.guest_makeup_trainings > 0) html += `<tr><td>Отработки (бесплатные)</td><td>${b.guest_makeup_trainings}</td></tr>`;
  if (b.prev_month_sick_deduction > 0) html += `<tr><td>Вычет за больничный</td><td>-${b.prev_month_sick_deduction}&#8381;</td></tr>`;
  if (b.sick_absences > 0) html += `<tr><td>Больничных (на след. месяц)</td><td>${b.sick_absences} дн.</td></tr>`;
  html += `<tr class="total"><td>ИТОГО</td><td>${b.total_amount}&#8381;</td></tr></table>`;
  if (b.paid) html += `<p style="color:#008637;font-weight:600;margin-top:8px">Оплачено${b.paid_at ? ' ' + new Date(b.paid_at).toLocaleDateString('ru-RU') : ''}</p>`;
  document.getElementById('billing-detail-content').innerHTML = html;
  document.getElementById('btn-mark-paid').style.display = b.paid ? 'none' : 'block';
  state.currentBillingId = billingId;
  state.currentBillingAmount = b.total_amount;
  showModal('modal-billing-detail');
}

async function markPaid() {
  if (!state.currentBillingId) return;
  try {
    await api.markPaid(state.currentBillingId, state.currentBillingAmount);
    closeModals(); toast('Оплата отмечена'); await loadBilling();
  } catch (err) { toast(err.message); }
}

// =======================================================
//                  DASHBOARDS
// =======================================================

async function initParentDashboard() {
  try {
    const children = await api.getParentChildren() || [];
    state.parentChildren = children;
    if (!children.length) {
      document.getElementById('dashboard-content').innerHTML = '<div class="empty-state"><div class="empty-icon">&#128102;</div><p>Дети не найдены</p></div>';
      navigateTo('parent-dashboard');
      return;
    }
    // Render selector
    const sel = document.getElementById('parent-children-selector');
    sel.innerHTML = children.map((c, i) =>
      `<button class="dash-child-btn ${i === 0 ? 'active' : ''}" onclick="selectParentChild('${c.id}', this)">${escHtml(c.full_name)}</button>`
    ).join('');
    navigateTo('parent-dashboard');
    await loadChildDashboard(children[0].id, 'dashboard-content');
  } catch (err) { toast(err.message); }
}

function selectParentChild(childId, btn) {
  document.querySelectorAll('.dash-child-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadChildDashboard(childId, 'dashboard-content');
}

async function openChildDashboardAdmin(childId, childName, backScreen) {
  document.getElementById('dash-child-name').textContent = childName;
  document.getElementById('dash-back-btn').onclick = () => navigateTo(backScreen || 'admin-dashboard');
  navigateTo('child-dashboard');
  await loadChildDashboard(childId, 'admin-dashboard-content');
}

async function loadChildDashboard(childId, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-ring" style="width:40px;height:40px;margin:0 auto;position:static"></div></div>';

  try {
    const d = await api.getChildDashboard(childId);
    renderDashboard(d, container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

function renderDashboard(d, container) {
  const child = d.child || {};
  const cm = d.current_month || {};
  const sickDays = d.sick_days || [];
  const billing = d.billing;
  const sickForDeduction = d.sick_absences_for_deduction || 0;

  const totalTrainings = (cm.total_trainings || 0) + (cm.guest_extra || 0);
  const included = child.included_trainings || 8;
  const extra = Math.max(0, totalTrainings - included);
  const extraFee = extra * (child.extra_training_fee || 0);
  const baseFee = child.base_monthly_fee || 0;
  const forecast = Math.max(0, baseFee + extraFee);

  // Deadline: last day of current month
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const deadlineStr = lastDay.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const daysLeft = Math.ceil((lastDay - now) / (1000*60*60*24));

  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const monthLabel = monthNames[now.getMonth()];

  let html = '';

  // Child info
  html += `<div style="margin-bottom:16px"><div style="font-size:18px;font-weight:700">${escHtml(child.full_name || '')}</div><div style="color:var(--hint);font-size:13px">${escHtml(d.group_name || '')} | ${child.birth_year || ''} г.р.</div></div>`;

  // Stats grid
  html += '<div class="dash-grid">';
  html += `<div class="dash-stat"><div class="stat-value">${cm.total_trainings || 0}</div><div class="stat-label">Тренировок</div></div>`;
  html += `<div class="dash-stat"><div class="stat-value">${cm.absences || 0}</div><div class="stat-label">Пропусков</div></div>`;
  html += `<div class="dash-stat"><div class="stat-value">${cm.guest_extra || 0}</div><div class="stat-label">Доп. тренировок</div></div>`;
  html += `<div class="dash-stat"><div class="stat-value">${cm.guest_makeup || 0}</div><div class="stat-label">Отработок</div></div>`;
  html += '</div>';

  // Sick days
  if (sickDays.length > 0) {
    html += '<div class="dash-sick"><div class="sick-title">&#127973; Больничные</div>';
    sickDays.forEach(s => {
      html += `<div class="sick-item">${formatDate(s.start_date)} &mdash; ${formatDate(s.end_date)}</div>`;
    });
    html += '</div>';
  }

  // Forecast
  html += '<div class="dash-forecast">';
  html += `<div class="forecast-title">&#128176; Прогноз оплаты за ${monthLabel}</div>`;
  html += `<div class="forecast-amount">${forecast} &#8381;</div>`;
  html += '<div class="forecast-detail">';
  html += `Абонемент: ${baseFee}&#8381;`;
  if (extra > 0) html += ` + доп: ${extra} &times; ${child.extra_training_fee}&#8381; = ${extraFee}&#8381;`;
  if (sickForDeduction > 0) html += `<br>Больничных пропусков: ${sickForDeduction} (вычет в след. месяце)`;
  html += '</div>';

  if (billing && billing.paid) {
    html += '<div style="color:var(--accent);font-weight:600;margin-top:8px">&#10003; Оплачено</div>';
  } else {
    html += `<div class="forecast-deadline">Дедлайн: ${deadlineStr} (${daysLeft} дн.)</div>`;
  }
  html += '</div>';

  // Billing history
  if (billing) {
    html += `<div style="font-size:13px;color:var(--hint);margin-top:8px">Начислено за месяц: ${billing.total_amount || 0}&#8381; | ${billing.paid ? 'Оплачено' : 'Не оплачено'}</div>`;
  }

  container.innerHTML = html;
}

// Admin: open child dashboard from children list
function renderAdminChildrenOrig() {} // placeholder

// =======================================================
//                  JOURNAL
// =======================================================

function initJournal() {
  const sel = document.getElementById('filter-journal-group');
  sel.innerHTML = '<option value="">Выберите группу</option>' +
    state.groups.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('');
  document.getElementById('filter-journal-month').value = currentMonth();
}

async function loadJournal() {
  const groupId = document.getElementById('filter-journal-group').value;
  const month = document.getElementById('filter-journal-month').value;
  const wrap = document.getElementById('journal-table-wrap');
  if (!groupId) { wrap.innerHTML = '<p style="color:var(--hint);text-align:center;padding:20px">Выберите группу</p>'; return; }

  try {
    const data = await api.getJournal(groupId, month);
    renderJournal(data, wrap);
  } catch (err) { toast(err.message); }
}

function renderJournal(data, wrap) {
  const children = data.children || [];
  const dates = (data.dates || []).map(d => String(d));
  const records = data.records || [];

  if (!children.length) {
    wrap.innerHTML = '<p style="color:var(--hint);text-align:center;padding:20px">В группе нет учеников</p>';
    return;
  }
  if (!dates.length) {
    wrap.innerHTML = '<p style="color:var(--hint);text-align:center;padding:20px">Нет данных за выбранный период</p>';
    return;
  }

  // Build lookup: child_id+date -> record
  const lookup = {};
  for (const r of records) {
    lookup[r.child_id + '|' + r.date] = r;
  }

  // Format dates as dd.mm
  const fmtDates = dates.map(d => {
    const parts = d.split('-');
    return parts[2] + '.' + parts[1];
  });

  let html = '<table class="journal-table"><thead><tr><th>ФИО</th>';
  fmtDates.forEach(d => { html += `<th>${d}</th>`; });
  html += '<th>Всего</th></tr></thead><tbody>';

  for (const child of children) {
    html += `<tr><td>${escHtml(child.full_name)}</td>`;
    let totalPresent = 0;
    for (const date of dates) {
      const r = lookup[child.id + '|' + date];
      if (r) {
        if (r.present) {
          totalPresent++;
          if (r.is_guest) {
            const label = r.guest_reason === 'makeup' ? 'отр' : 'доп';
            html += `<td class="mark-guest">${label}</td>`;
          } else {
            html += '<td class="mark-yes">&#10003;</td>';
          }
        } else {
          html += '<td class="mark-no">&mdash;</td>';
        }
      } else {
        html += '<td></td>';
      }
    }
    html += `<td style="font-weight:700">${totalPresent}</td></tr>`;
  }

  html += '</tbody></table>';

  // Summary
  const totalDays = dates.length;
  html += `<div class="journal-summary">Тренировок: <span>${totalDays}</span></div>`;

  wrap.innerHTML = html;
}

// ===== Utilities =====
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
