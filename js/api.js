// ===== Direct Supabase API (bypassing n8n) =====
const SUPABASE_URL = 'https://xckenommhsndvjdwsuzb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhja2Vub21taHNuZHZqZHdzdXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzODEzMTEsImV4cCI6MjA4ODk1NzMxMX0.jguCl07iAu60EsxCkChAieEx-7MDDrvabofERTkXbg4';
const tg = window.Telegram?.WebApp;

async function apiCall(action, data = {}) {
  const telegramId = tg?.initDataUnsafe?.user?.id;
  if (!telegramId) throw new Error('No Telegram user');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/api_handler`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      p_action: action,
      p_telegram_id: telegramId,
      p_data: { action, telegram_id: telegramId, ...data }
    })
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'API error');
  }
  return json.data;
}

const api = {
  getRole: () => apiCall('get_role'),
  getGroups: () => apiCall('get_groups'),
  createGroup: (name) => apiCall('create_group', { name }),
  updateGroup: (group_id, name) => apiCall('update_group', { group_id, name }),
  addCoach: (group_id, coach_telegram_id) =>
    apiCall('add_coach_to_group', { group_id, coach_telegram_id }),
  removeCoach: (group_id, coach_telegram_id) =>
    apiCall('remove_coach_from_group', { group_id, coach_telegram_id }),
  getChildren: (group_id) => apiCall('get_children', { group_id }),
  getAllChildren: () => apiCall('get_all_children'),
  addChild: (data) => apiCall('add_child', data),
  updateChild: (data) => apiCall('update_child', data),
  deactivateChild: (child_id) => apiCall('deactivate_child', { child_id }),
  submitAttendance: (group_id, group_name, training_date, attendees) =>
    apiCall('submit_attendance', { group_id, group_name, training_date, attendees }),
  submitGuestAttendance: (child_id, group_id, training_date, guest_reason) =>
    apiCall('submit_guest_attendance', { child_id, group_id, training_date, guest_reason }),
  getAttendanceHistory: (group_id, date_from, date_to) =>
    apiCall('get_attendance_history', { group_id, date_from, date_to }),
  getSickDays: (child_id) => apiCall('get_sick_days', child_id ? { child_id } : {}),
  addSickDay: (child_id, start_date, end_date, reason) =>
    apiCall('add_sick_days', { child_id, start_date, end_date, reason }),
  deleteSickDay: (sick_day_id) => apiCall('delete_sick_day', { sick_day_id }),
  getBilling: (month, group_id) => apiCall('get_billing', { month, group_id }),
  markPaid: (billing_id, paid_amount) => apiCall('mark_paid', { billing_id, paid_amount }),
  getJournal: (group_id, month) => apiCall('get_journal', { group_id, month }),
};
