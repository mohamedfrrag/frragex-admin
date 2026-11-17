const base = "https://cstufywfjilztdnpnnvs.supabase.co";
const key = "sb_publishable_6Yx9YoqE9CQQ9UmRrlOsBA_S23FBs9y";
const $ = selector => document.querySelector(selector);
const date = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" });
let token = "";
let busy = false;

const errors = {
  forbidden: "الحساب لا يملك صلاحية الإدارة.",
  username_exists: "اسم المستخدم مستخدم بالفعل.",
  auth_rejected: "رفض Supabase إنشاء الحساب. راجع سياسة كلمات المرور.",
  invalid_input: "تحقق من الاسم وكلمة المرور ومدة الاشتراك.",
  check_auth_users: "تعذر تأكيد إنشاء الحساب. راجع سجل الحسابات وSupabase Auth قبل المحاولة مجددًا.",
  provision_failed: "تعذر تفعيل الاشتراك. يمكنك إعادة المحاولة.",
};

function status(message, error = false) {
  $("#status").textContent = message;
  $("#status").classList.toggle("error", error);
}

function session(value) {
  token = value;
  $("#signin").hidden = Boolean(token);
  $("#dashboard").hidden = !token;
  $("#logout").hidden = !token;
  if (!token) $("tbody").replaceChildren();
}

async function api(path, body, authorization = token) {
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (authorization) headers.Authorization = "Bearer " + authorization;
  let response;
  try { response = await fetch(base + path, { method:"POST", headers, body:JSON.stringify(body) }); }
  catch { throw new Error("تعذر الاتصال بـSupabase."); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && authorization === token && token) {
      session("");
      throw new Error("انتهت جلسة الإدارة. سجّل الدخول مرة أخرى.");
    }
    const error = errors[data?.error] ?? (response.status === 403 ?
      errors.forbidden : response.status === 429 ? "محاولات كثيرة. حاول لاحقًا." : "تعذّر تنفيذ الطلب.");
    throw new Error(error);
  }
  return data;
}

const rpc = (name, body = {}, authorization = token) => api("/rest/v1/rpc/" + name, body, authorization);
async function run(task) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach(button => button.disabled = true);
  try { await task(); }
  catch (error) { status(error.message, true); }
  finally {
    busy = false;
    document.querySelectorAll("button").forEach(button => {
      button.disabled = button.dataset.available === "no";
    });
  }
}

function cell(row, text) {
  const td = row.insertCell();
  td.textContent = text;
  return td;
}
function action(parent, label, enabled, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.available = enabled ? "yes" : "no";
  button.disabled = busy || !enabled;
  button.addEventListener("click", () => run(callback));
  parent.append(button);
}

async function refresh() {
  const accounts = await rpc("frragex_list_accounts");
  const body = $("tbody");
  body.replaceChildren();
  $("#empty").hidden = accounts.length > 0;
  $("#table").hidden = !accounts.length;
  for (const account of accounts) {
    const row = body.insertRow();
    cell(row, account.username).dir = "ltr";
    cell(row, !account.enabled ? "موقوف" : Date.parse(account.expires_at) <= Date.now() ? "منتهي" : "نشط");
    cell(row, date.format(new Date(account.expires_at)));
    cell(row, account.bound_at ? "مرتبط · " + date.format(new Date(account.bound_at)) : "غير مرتبط");
    const controls = cell(row, "");
    const change = async (name, days = null) => {
      await rpc("frragex_manage_account", { p_user_id:account.user_id, p_action:name, p_days:days });
      await refresh();
      status("تم تحديث " + account.username);
    };
    action(controls, account.enabled ? "إيقاف" : "تفعيل", true, async () => {
      if (account.enabled && !confirm("إيقاف حساب " + account.username + "؟")) return;
      await change(account.enabled ? "disable" : "enable");
    });
    action(controls, "تمديد", true, async () => {
      const input = prompt("عدد أيام التمديد لحساب " + account.username, "30");
      if (input === null) return;
      if (!/^\d+$/.test(input) || Number(input) < 1 || Number(input) > 3650) {
        throw new Error("أدخل عدد أيام من 1 إلى 3650.");
      }
      await change("extend", Number(input));
    });
    action(controls, "فك الربط", Boolean(account.bound_at), async () => {
      if (confirm("فك ربط التلفزيون لحساب " + account.username + "؟")) await change("unbind");
    });
  }
}

$("#login").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  run(async () => {
    const fields = new FormData(form);
    const password = fields.get("password");
    form.elements.password.value = "";
    const auth = await api("/auth/v1/token?grant_type=password",
      { email:fields.get("email"), password }, "");
    if (await rpc("frragex_is_admin", {}, auth.access_token) !== true) throw new Error(errors.forbidden);
    session(auth.access_token);
    await refresh();
    status("تم تسجيل الدخول.");
  });
});
$("#create").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  run(async () => {
    const fields = new FormData(form);
    const body = { username:fields.get("username"), password:fields.get("password"), days:Number(fields.get("days")) };
    form.elements.password.value = "";
    await api("/functions/v1/frragex-create-account", body);
    form.reset();
    await refresh();
    status("تم إنشاء " + body.username + ". استخدم بياناته على التلفزيون.");
  });
});
$("#refresh").onclick = () => run(async () => { await refresh(); status("تم تحديث الحسابات."); });
$("#logout").onclick = () => run(async () => {
  try { await api("/auth/v1/logout?scope=local", {}); }
  finally { session(""); status("تم تسجيل الخروج."); }
});
