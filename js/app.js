// ===== App State =====
let state = {
  role: null, // 'coach' | 'admin'
  groups: [],
  currentGroupId: null,
  currentGroupName: '',
  children: [],
  allChildren: [],
  attendanceMap: {}, // child_id -> present
  guestAttendance: [], // [{child_id, guest_reason}]
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  if (tg) {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
  }
  await init();
});

async function init() {
  try {
    // Test auth by fetching groups
    const groups = await api.getGroups();
    state.groups = groups;

    // Determine role: if user can get groups, they're authorized
    // Try admin action to check role
    try {
      await apiCall('get_billing', { month: null });
      state.role = 'admin';
    } catch {
      state.role = 'coach';
    }

    if (state.role === 'admin') {
      navigateTo('admin-dashboard');
      await loadAdminData();
    } else {
      navigateTo('coach-groups');
      renderCoachGroups();
    }
  } catch (err) {
    if (err.message.includes('Unauthorized') || err.message.includes('403')) {
      navigateTo('unauthorized');
    } else {
      toast('Error: ' + err.message);
      navigateTo('unauthorized');
    }
  }
}

// ===== Navigation =====
function navigateTo(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
}

// ===== Toast =====
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, 2500);
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
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

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
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⚽</div><h2>No groups</h2><p>You are not assigned to any groups yet.</p></div>';
    return;
  }
  list.innerHTML = state.groups.map(g => `
    <div class="card" onclick="openAttendance('${g.id}', '${escHtml(g.name)}', 'coach')">
      <div class="card-title">⚽ ${escHtml(g.name)}</div>
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
    state.children = children;
    state.attendanceMap = {};
    children.forEach(c => { state.attendanceMap[c.id] = true; }); // default: present
    state.guestAttendance = [];
    renderAttendanceList(prefix);
  } catch (err) {
    toast('Error: ' + err.message);
  }
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

// ===== Guests =====
function toggleGuests() {
  const content = document.getElementById('guest-content');
  const icon = document.getElementById('guest-toggle');
  content.classList.toggle('hidden');
  icon.classList.toggle('open');
  if (!content.classList.contains('hidden') && !state.allChildren.length) {
    loadAllChildren();
  }
}

async function loadAllChildren() {
  try {
    state.allChildren = await api.getAllChildren();
  } catch (err) {
    toast('Error loading children');
  }
}

function searchGuests() {
  const q = document.getElementById('guest-search').value.toLowerCase();
  if (q.length < 2) {
    document.getElementById('guest-results').innerHTML = '';
    return;
  }
  // Filter: not in current group, match query
  const results = state.allChildren.filter(c =>
    c.group_id !== state.currentGroupId &&
    c.full_name.toLowerCase().includes(q)
  ).slice(0, 10);

  document.getElementById('guest-results').innerHTML = results.map(c => {
    const alreadyAdded = state.guestAttendance.some(g => g.child_id === c.id);
    return `
      <div class="guest-item">
        <div class="child-info">
          <div>${escHtml(c.full_name)}</div>
          <div class="group-tag">${escHtml(c.groups?.name || '')}</div>
        </div>
        <div class="guest-actions">
          ${alreadyAdded ? '<span style="color:var(--accent)">Added</span>' : `
            <button class="btn-small green" onclick="addGuest('${c.id}','makeup')">Makeup</button>
            <button class="btn-small gray" onclick="addGuest('${c.id}','extra')">Extra</button>
          `}
        </div>
      </div>
    `;
  }).join('') || '<p style="color:var(--hint);padding:8px">No results</p>';
}

function addGuest(childId, reason) {
  if (!state.guestAttendance.some(g => g.child_id === childId)) {
    state.guestAttendance.push({ child_id: childId, guest_reason: reason });
    toast(reason === 'makeup' ? 'Added as makeup' : 'Added as extra');
    searchGuests(); // refresh UI
  }
}

async function saveAttendance() {
  const dateInput = document.querySelector('.screen.active input[type="date"]');
  const date = dateInput.value;
  if (!date) { toast('Select date'); return; }

  const btn = document.querySelector('.screen.active .btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // Save main attendance
    const attendees = state.children.map(c => ({
      child_id: c.id,
      present: !!state.attendanceMap[c.id]
    }));
    await api.submitAttendance(state.currentGroupId, date, attendees);

    // Save guest attendance
    for (const guest of state.guestAttendance) {
      await api.submitGuestAttendance(
        guest.child_id, state.currentGroupId, date, guest.guest_reason
      );
    }

    toast('Saved!');
    if (tg) tg.HapticFeedback?.notificationOccurred('success');
  } catch (err) {
    toast('Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

// =======================================================
//                  ADMIN SCREENS
// =======================================================

async function loadAdminData() {
  try {
    state.groups = await api.getGroups();
    renderAdminGroups();
    populateGroupSelects();

    // Set default month filter
    document.getElementById('filter-month').value = currentMonth();
  } catch (err) {
    toast('Error: ' + err.message);
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // Load tab data
  if (tabName === 'children') loadAdminChildren();
  if (tabName === 'sick') loadSickDays();
  if (tabName === 'billing') loadBilling();
  if (tabName === 'groups') renderAdminGroups();
}

function populateGroupSelects() {
  const selects = ['filter-group', 'filter-billing-group', 'input-child-group', 'edit-child-group'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id.startsWith('filter');
    el.innerHTML = (isFilter ? '<option value="">All groups</option>' : '') +
      state.groups.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('');
  });
}

// ----- Admin: Groups -----
function renderAdminGroups() {
  const list = document.getElementById('admin-groups-list');
  list.innerHTML = state.groups.map(g => {
    const coaches = g.group_coaches || [];
    return `
      <div class="card">
        <div class="card-row">
          <div>
            <div class="card-title">⚽ ${escHtml(g.name)}</div>
            <div class="coach-tags">
              ${coaches.map(c => `<span class="coach-tag">Coach: ${c.coach_telegram_id}</span>`).join('')}
            </div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn-small green" onclick="openAddCoach('${g.id}','${escHtml(g.name)}')">+Coach</button>
            <button class="btn-small gray" onclick="openAttendance('${g.id}','${escHtml(g.name)}','admin')">Attend</button>
          </div>
        </div>
      </div>
    `;
  }).join('') || '<div class="empty-state"><div class="empty-icon">📋</div><p>No groups yet</p></div>';
}

async function createGroup() {
  const name = document.getElementById('input-group-name').value.trim();
  if (!name) { toast('Enter group name'); return; }
  try {
    await api.createGroup(name);
    closeModals();
    document.getElementById('input-group-name').value = '';
    toast('Group created');
    await loadAdminData();
  } catch (err) { toast('Error: ' + err.message); }
}

function openAddCoach(groupId, groupName) {
  state.currentGroupId = groupId;
  document.getElementById('coach-group-label').textContent = groupName;
  document.getElementById('input-coach-tg-id').value = '';
  showModal('modal-add-coach');
}

async function addCoach() {
  const coachId = document.getElementById('input-coach-tg-id').value.trim();
  if (!coachId) { toast('Enter Coach Telegram ID'); return; }
  try {
    await api.addCoach(state.currentGroupId, parseInt(coachId));
    closeModals();
    toast('Coach added');
    await loadAdminData();
  } catch (err) { toast('Error: ' + err.message); }
}

// ----- Admin: Children -----
async function loadAdminChildren() {
  const groupId = document.getElementById('filter-group').value;
  try {
    let children;
    if (groupId) {
      children = await api.getChildren(groupId);
    } else {
      children = await api.getAllChildren();
    }
    renderAdminChildren(children);
  } catch (err) { toast('Error: ' + err.message); }
}

function renderAdminChildren(children) {
  const list = document.getElementById('admin-children-list');
  list.innerHTML = children.map(c => `
    <div class="card" onclick="openEditChild('${c.id}')">
      <div class="card-row">
        <div>
          <div class="card-title">${escHtml(c.full_name)}</div>
          <div class="card-subtitle">${c.groups?.name || ''} | ${c.birth_year || ''} | ${c.base_monthly_fee}₽/мес</div>
        </div>
        <div class="badge-amount">${c.base_monthly_fee}₽</div>
      </div>
    </div>
  `).join('') || '<div class="empty-state"><div class="empty-icon">👦</div><p>No children</p></div>';

  // Cache for edit
  state.adminChildren = children;
}

async function addChild() {
  const data = {
    group_id: document.getElementById('input-child-group').value,
    full_name: document.getElementById('input-child-name').value.trim(),
    birth_year: parseInt(document.getElementById('input-child-year').value) || null,
    parent_telegram_id: parseInt(document.getElementById('input-parent-tg-id').value) || null,
    parent_name: document.getElementById('input-parent-name').value.trim() || null,
    base_monthly_fee: parseInt(document.getElementById('input-base-fee').value) || 0,
    included_trainings: parseInt(document.getElementById('input-included').value) || 8,
    extra_training_fee: parseInt(document.getElementById('input-extra-fee').value) || 0,
  };
  if (!data.full_name || !data.group_id) { toast('Fill name and group'); return; }
  try {
    await api.addChild(data);
    closeModals();
    // Clear form
    ['input-child-name','input-child-year','input-parent-tg-id','input-parent-name','input-base-fee','input-extra-fee'].forEach(id => document.getElementById(id).value = '');
    toast('Child added');
    await loadAdminChildren();
  } catch (err) { toast('Error: ' + err.message); }
}

function openEditChild(childId) {
  const c = state.adminChildren?.find(x => x.id === childId);
  if (!c) return;
  document.getElementById('edit-child-id').value = c.id;
  document.getElementById('edit-child-group').value = c.group_id;
  document.getElementById('edit-child-name').value = c.full_name;
  document.getElementById('edit-child-year').value = c.birth_year || '';
  document.getElementById('edit-parent-tg-id').value = c.parent_telegram_id || '';
  document.getElementById('edit-parent-name').value = c.parent_name || '';
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
    parent_telegram_id: parseInt(document.getElementById('edit-parent-tg-id').value) || null,
    parent_name: document.getElementById('edit-parent-name').value.trim() || null,
    base_monthly_fee: parseInt(document.getElementById('edit-base-fee').value) || 0,
    included_trainings: parseInt(document.getElementById('edit-included').value) || 8,
    extra_training_fee: parseInt(document.getElementById('edit-extra-fee').value) || 0,
  };
  try {
    await api.updateChild(data);
    closeModals();
    toast('Updated');
    await loadAdminChildren();
  } catch (err) { toast('Error: ' + err.message); }
}

async function deactivateChild() {
  const childId = document.getElementById('edit-child-id').value;
  if (!confirm('Deactivate this child?')) return;
  try {
    await api.deactivateChild(childId);
    closeModals();
    toast('Deactivated');
    await loadAdminChildren();
  } catch (err) { toast('Error: ' + err.message); }
}

// ----- Admin: Sick Days -----
async function loadSickDays() {
  try {
    const sick = await api.getSickDays();
    renderSickDays(sick);

    // Populate child select for modal
    if (!state.allChildren.length) {
      state.allChildren = await api.getAllChildren();
    }
    const sel = document.getElementById('input-sick-child');
    sel.innerHTML = state.allChildren.map(c =>
      `<option value="${c.id}">${escHtml(c.full_name)} (${c.groups?.name || ''})</option>`
    ).join('');
  } catch (err) { toast('Error: ' + err.message); }
}

function renderSickDays(sickDays) {
  const list = document.getElementById('admin-sick-list');
  list.innerHTML = sickDays.map(s => `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${escHtml(s.children?.full_name || '?')}</div>
          <div class="card-subtitle">${formatDate(s.start_date)} — ${formatDate(s.end_date)} | ${s.reason || 'sick'}</div>
        </div>
        <button class="btn-small red" onclick="deleteSickDay('${s.id}')">Delete</button>
      </div>
    </div>
  `).join('') || '<div class="empty-state"><div class="empty-icon">🏥</div><p>No sick days recorded</p></div>';
}

async function addSickDay() {
  const child_id = document.getElementById('input-sick-child').value;
  const start = document.getElementById('input-sick-start').value;
  const end = document.getElementById('input-sick-end').value;
  if (!child_id || !start || !end) { toast('Fill all fields'); return; }
  if (end < start) { toast('End date must be after start'); return; }
  try {
    await api.addSickDay(child_id, start, end, 'sick');
    closeModals();
    toast('Sick day added');
    await loadSickDays();
  } catch (err) { toast('Error: ' + err.message); }
}

async function deleteSickDay(id) {
  if (!confirm('Delete this sick day record?')) return;
  try {
    await api.deleteSickDay(id);
    toast('Deleted');
    await loadSickDays();
  } catch (err) { toast('Error: ' + err.message); }
}

// ----- Admin: Billing -----
async function loadBilling() {
  const monthInput = document.getElementById('filter-month').value; // "2026-03"
  const groupId = document.getElementById('filter-billing-group').value;
  if (!monthInput) return;

  const month = monthInput + '-01'; // "2026-03-01"
  try {
    const bills = await api.getBilling(month, groupId || undefined);
    renderBilling(bills);
  } catch (err) { toast('Error: ' + err.message); }
}

function renderBilling(bills) {
  // Summary
  const total = bills.reduce((s, b) => s + (b.total_amount || 0), 0);
  const paid = bills.filter(b => b.paid).reduce((s, b) => s + (b.total_amount || 0), 0);
  const unpaid = total - paid;

  document.getElementById('billing-summary').innerHTML = `
    <div class="summary-item"><div class="label">Total</div><div class="value">${total}₽</div></div>
    <div class="summary-item"><div class="label">Paid</div><div class="value" style="color:#4CAF50">${paid}₽</div></div>
    <div class="summary-item"><div class="label">Unpaid</div><div class="value" style="color:#ef5350">${unpaid}₽</div></div>
  `;

  const list = document.getElementById('admin-billing-list');
  list.innerHTML = bills.map(b => {
    const child = b.children || {};
    return `
      <div class="card" onclick="openBillingDetail('${b.id}')">
        <div class="card-row">
          <div>
            <div class="card-title">${escHtml(child.full_name || '?')}</div>
            <div class="card-subtitle">${child.groups?.name || ''}</div>
          </div>
          <div style="text-align:right">
            <div class="badge-amount">${b.total_amount}₽</div>
            <span class="card-badge ${b.paid ? 'badge-paid' : 'badge-unpaid'}">${b.paid ? 'Paid' : 'Unpaid'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('') || '<div class="empty-state"><div class="empty-icon">💰</div><p>No billing records for this month</p></div>';

  // Cache for detail view
  state.billingData = bills;
}

function openBillingDetail(billingId) {
  const b = state.billingData?.find(x => x.id === billingId);
  if (!b) return;

  document.getElementById('billing-detail-name').textContent = b.children?.full_name || '?';

  let html = '<table class="detail-table">';
  html += `<tr><td>Base fee</td><td>${b.base_fee}₽</td></tr>`;
  html += `<tr><td>Trainings (own group)</td><td>${b.total_trainings}</td></tr>`;
  html += `<tr><td>Included in subscription</td><td>${b.included_trainings}</td></tr>`;
  if (b.extra_trainings > 0) html += `<tr><td>Extra trainings</td><td>+${b.extra_fee}₽</td></tr>`;
  if (b.guest_extra_trainings > 0) html += `<tr><td>Guest (extra, paid)</td><td>${b.guest_extra_trainings}</td></tr>`;
  if (b.guest_makeup_trainings > 0) html += `<tr><td>Guest (makeup, free)</td><td>${b.guest_makeup_trainings}</td></tr>`;
  if (b.prev_month_sick_deduction > 0) html += `<tr><td>Sick day deduction</td><td>-${b.prev_month_sick_deduction}₽</td></tr>`;
  if (b.sick_absences > 0) html += `<tr><td>Sick absences (for next month)</td><td>${b.sick_absences} days</td></tr>`;
  html += `<tr class="total"><td>TOTAL</td><td>${b.total_amount}₽</td></tr>`;
  html += '</table>';

  if (b.paid) {
    html += `<p style="color:#4CAF50;font-weight:600;margin-top:8px">Paid${b.paid_at ? ' on ' + new Date(b.paid_at).toLocaleDateString('ru-RU') : ''}</p>`;
  }

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
    closeModals();
    toast('Marked as paid');
    await loadBilling();
  } catch (err) { toast('Error: ' + err.message); }
}

// ===== Utilities =====
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
