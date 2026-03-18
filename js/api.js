// ===== API Layer =====
const API_URL = 'https://1-deslab.amvera.io/webhook/football-api';

const tg = window.Telegram?.WebApp;
let currentUser = null; // { telegram_id, role, name }

async function apiCall(action, data = {}) {
  const telegramId = tg?.initDataUnsafe?.user?.id;
  if (!telegramId) throw new Error('No Telegram user');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      telegram_id: telegramId,
      initData: tg?.initData || '',
      ...data
    })
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'API error');
  }
  return json.data;
}

// ===== API Methods =====

// Auth
const api = {
  getRole: () => apiCall('get_role'),

  // Groups
  getGroups: () => apiCall('get_groups'),
  createGroup: (name) => apiCall('create_group', { name }),
  updateGroup: (group_id, name) => apiCall('update_group', { group_id, name }),
  addCoach: (group_id, coach_telegram_id) =>
    apiCall('add_coach_to_group', { group_id, coach_telegram_id }),
  removeCoach: (group_id, coach_telegram_id) =>
    apiCall('remove_coach_from_group', { group_id, coach_telegram_id }),

  // Children
  getChildren: (group_id) => apiCall('get_children', { group_id }),
  getAllChildren: () => apiCall('get_all_children'),
  addChild: (data) => apiCall('add_child', data),
  updateChild: (data) => apiCall('update_child', data),
  deactivateChild: (child_id) => apiCall('deactivate_child', { child_id }),

  // Attendance
  submitAttendance: (group_id, group_name, training_date, attendees) =>
    apiCall('submit_attendance', { group_id, group_name, training_date, attendees }),
  submitGuestAttendance: (child_id, group_id, training_date, guest_reason) =>
    apiCall('submit_guest_attendance', { child_id, group_id, training_date, guest_reason }),
  getAttendanceHistory: (group_id, date_from, date_to) =>
    apiCall('get_attendance_history', { group_id, date_from, date_to }),

  // Sick Days
  getSickDays: (child_id) => apiCall('get_sick_days', child_id ? { child_id } : {}),
  addSickDay: (child_id, start_date, end_date, reason) =>
    apiCall('add_sick_days', { child_id, start_date, end_date, reason }),
  deleteSickDay: (sick_day_id) => apiCall('delete_sick_day', { sick_day_id }),

  // Billing
  getBilling: (month, group_id) => apiCall('get_billing', { month, group_id }),
  markPaid: (billing_id, paid_amount) => apiCall('mark_paid', { billing_id, paid_amount }),
};
