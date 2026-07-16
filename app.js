import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { APP_CONFIG, SUPABASE_CONFIG } from "./config.js";

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const state = { session: null, profile: null, wallet: null, orders: [], ledger: [], authMode: "signin", admin: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  authButton: $("#authButton"), accountButton: $("#accountButton"), adminButton: $("#adminButton"),
  authDialog: $("#authDialog"), accountDialog: $("#accountDialog"), adminDialog: $("#adminDialog"), adjustDialog: $("#adjustDialog"),
  authForm: $("#authForm"), authTitle: $("#authTitle"), authSubmit: $("#authSubmit"), authFeedback: $("#authFeedback"),
  nameField: $("#nameField"), nameInput: $("#nameInput"), emailInput: $("#emailInput"), passwordInput: $("#passwordInput"),
  plansGrid: $("#plansGrid"), productsGrid: $("#productsGrid"), downloadButton: $("#downloadButton"), toast: $("#toast"),
  accountLoading: $("#accountLoading"), accountContent: $("#accountContent"), accountAvatar: $("#accountAvatar"),
  accountName: $("#accountName"), accountEmail: $("#accountEmail"), accountBalance: $("#accountBalance"),
  accountUsed: $("#accountUsed"), accountRole: $("#accountRole"), accountOrders: $("#accountOrders"), accountLedger: $("#accountLedger"),
  signOutButton: $("#signOutButton"), adminLoading: $("#adminLoading"), adminContent: $("#adminContent"),
  adminSummary: $("#adminSummary"), adminOrders: $("#adminOrders"), adminUsers: $("#adminUsers"),
  adjustForm: $("#adjustForm"), adjustUserId: $("#adjustUserId"), adjustUserLabel: $("#adjustUserLabel"),
  adjustAmount: $("#adjustAmount"), adjustReason: $("#adjustReason")
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function formatCurrency(cents) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function showToast(message, error = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", error);
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 4200);
}

function friendlyError(error) {
  const message = error?.message || String(error || "Erro desconhecido.");
  const translations = [
    [/Invalid login credentials/i, "E-mail ou senha incorretos."],
    [/Email not confirmed/i, "Confirme seu e-mail antes de entrar."],
    [/User already registered/i, "Este e-mail já está cadastrado."],
    [/Password should be at least/i, "A senha precisa ter pelo menos 8 caracteres."],
    [/Failed to fetch/i, "Não foi possível conectar ao servidor."],
    [/relation .* does not exist/i, "O banco ainda não foi preparado. Execute a migração do Supabase."],
    [/Saldo de créditos insuficiente/i, "Seu saldo de créditos é insuficiente."]
  ];
  return translations.find(([pattern]) => pattern.test(message))?.[1] || message;
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function setAuthMode(mode) {
  state.authMode = mode;
  $$('[data-auth-tab]').forEach((button) => button.classList.toggle("active", button.dataset.authTab === mode));
  const signup = mode === "signup";
  elements.nameField.hidden = !signup;
  elements.nameInput.required = signup;
  elements.passwordInput.autocomplete = signup ? "new-password" : "current-password";
  elements.authTitle.textContent = signup ? "Criar sua conta" : "Entrar no Market Copilot";
  elements.authSubmit.textContent = signup ? "Criar conta" : "Entrar";
  elements.authFeedback.textContent = "";
  elements.authFeedback.className = "form-feedback";
}

async function loadCatalog() {
  const [{ data: plans, error: plansError }, { data: products }] = await Promise.all([
    supabase.from("plans").select("code,name,description,price_cents,credits,features,display_order").eq("active", true).order("display_order"),
    supabase.from("products").select("slug,name,description,price_cents,category,display_order").eq("active", true).order("display_order")
  ]);

  const fallbackPlans = [
    { code: "starter-300", name: "Essencial", description: "Para testar o copiloto e usar análises com controle de custo.", price_cents: 6000, credits: 300, features: ["300 créditos", "Motor Leve e Médio", "GPT opcional", "Histórico de consumo"] },
    { code: "pro-600", name: "Profissional", description: "Mais créditos e melhor custo para uso frequente.", price_cents: 10000, credits: 600, features: ["600 créditos", "Todos os modos", "GPT + notícias", "Melhor custo por crédito"] }
  ];
  renderPlans(plans?.length ? plans : fallbackPlans);
  if (plansError) console.warn("Catálogo local temporário:", plansError.message);

  if (products?.length) {
    elements.productsGrid.innerHTML = products.map((product) => `
      <article><span>${escapeHtml(product.category).toUpperCase()}</span><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p>
      ${product.price_cents ? `<strong>${formatCurrency(product.price_cents)}</strong>` : ""}</article>`).join("");
  }
}

function renderPlans(plans) {
  elements.plansGrid.innerHTML = plans.map((plan, index) => {
    const features = Array.isArray(plan.features) ? plan.features : [];
    const price = (Number(plan.price_cents) || 0) / 100;
    const [whole, cents = "00"] = price.toFixed(2).split(".");
    return `<article class="plan-card ${index === plans.length - 1 ? "recommended" : ""}">
      <span class="plan-kicker">PACOTE DE CRÉDITOS</span><h3>${escapeHtml(plan.name)}</h3><p>${escapeHtml(plan.description)}</p>
      <div class="plan-price"><span>R$</span><strong>${whole}</strong><span>,${cents}</span></div><div class="plan-credits">${Number(plan.credits).toLocaleString("pt-BR")} créditos</div>
      <ul>${features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>
      <button class="${index === plans.length - 1 ? "primary-button" : "ghost-button"}" data-buy-plan="${escapeHtml(plan.code)}">Comprar créditos</button>
    </article>`;
  }).join("");
}

async function loadAccount() {
  if (!state.session?.user) return;
  elements.accountLoading.hidden = false;
  elements.accountContent.hidden = true;
  const userId = state.session.user.id;
  const [profileResult, walletResult, ordersResult, ledgerResult] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,role,created_at").eq("id", userId).maybeSingle(),
    supabase.from("credit_wallets").select("balance,lifetime_purchased,lifetime_used,updated_at").eq("user_id", userId).maybeSingle(),
    supabase.from("orders").select("id,description,amount_cents,credits,status,created_at,paid_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("credit_ledger").select("id,delta,balance_after,kind,description,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30)
  ]);

  const error = profileResult.error || walletResult.error || ordersResult.error || ledgerResult.error;
  if (error) {
    elements.accountLoading.textContent = friendlyError(error);
    return;
  }

  state.profile = profileResult.data || { email: state.session.user.email, full_name: "", role: "user" };
  state.wallet = walletResult.data || { balance: 0, lifetime_used: 0 };
  state.orders = ordersResult.data || [];
  state.ledger = ledgerResult.data || [];
  renderAccount();
}

function renderAccount() {
  const name = state.profile?.full_name || state.session?.user?.email?.split("@")[0] || "Usuário";
  elements.accountAvatar.textContent = name.slice(0, 1).toUpperCase();
  elements.accountName.textContent = name;
  elements.accountEmail.textContent = state.profile?.email || state.session?.user?.email || "—";
  elements.accountBalance.textContent = Number(state.wallet?.balance || 0).toLocaleString("pt-BR");
  elements.accountUsed.textContent = Number(state.wallet?.lifetime_used || 0).toLocaleString("pt-BR");
  elements.accountRole.textContent = state.profile?.role === "admin" ? "Administrador" : "Cliente";
  elements.accountOrders.innerHTML = state.orders.length ? state.orders.map((order) => `<div class="order-item"><div><strong>${escapeHtml(order.description)}</strong><span>${formatCurrency(order.amount_cents)} • ${order.credits} créditos • ${formatDate(order.created_at)}</span></div><b class="status-tag status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</b></div>`).join("") : '<div class="empty-list">Nenhum pedido criado.</div>';
  elements.accountLedger.innerHTML = state.ledger.length ? state.ledger.map((entry) => `<div class="ledger-item"><div><strong>${escapeHtml(entry.description || entry.kind)}</strong><span>${formatDate(entry.created_at)} • saldo ${entry.balance_after}</span></div><b class="${entry.delta > 0 ? "positive" : ""}">${entry.delta > 0 ? "+" : ""}${entry.delta}</b></div>`).join("") : '<div class="empty-list">Nenhuma movimentação registrada.</div>';
  elements.accountLoading.hidden = true;
  elements.accountContent.hidden = false;
}

async function renderSession(session) {
  state.session = session;
  const logged = Boolean(session?.user);
  elements.authButton.hidden = logged;
  elements.accountButton.hidden = !logged;
  if (!logged) {
    state.profile = null; state.wallet = null; state.orders = []; state.ledger = [];
    elements.adminButton.hidden = true;
    return;
  }
  elements.accountButton.textContent = session.user.email?.split("@")[0] || "Minha conta";
  await loadAccount();
  elements.adminButton.hidden = state.profile?.role !== "admin";
}

async function buyPlan(code) {
  if (!state.session) {
    setAuthMode("signin");
    openDialog(elements.authDialog);
    showToast("Entre para criar seu pedido de créditos.");
    return;
  }
  const button = document.querySelector(`[data-buy-plan="${CSS.escape(code)}"]`);
  if (button) { button.disabled = true; button.textContent = "Criando pedido…"; }
  const { error } = await supabase.rpc("create_plan_order", { p_plan_code: code });
  if (button) { button.disabled = false; button.textContent = "Comprar créditos"; }
  if (error) return showToast(friendlyError(error), true);
  await loadAccount();
  openDialog(elements.accountDialog);
  showToast("Pedido criado. O pagamento ainda precisa ser confirmado.");
}

async function loadAdmin() {
  elements.adminLoading.hidden = false;
  elements.adminContent.hidden = true;
  const { data, error } = await supabase.rpc("admin_dashboard");
  if (error) { elements.adminLoading.textContent = friendlyError(error); return; }
  state.admin = data;
  renderAdmin();
  elements.adminLoading.hidden = true;
  elements.adminContent.hidden = false;
}

function renderAdmin() {
  const summary = state.admin?.summary || {};
  elements.adminSummary.innerHTML = [
    ["USUÁRIOS", summary.users || 0], ["CRÉDITOS EM SALDO", summary.credits || 0],
    ["PEDIDOS PENDENTES", summary.pendingOrders || 0], ["RECEITA CONFIRMADA", formatCurrency(summary.paidRevenueCents || 0)]
  ].map(([label, value]) => `<article><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

  const orders = state.admin?.orders || [];
  elements.adminOrders.innerHTML = `<table class="admin-table"><thead><tr><th>CLIENTE</th><th>PEDIDO</th><th>VALOR</th><th>CRÉDITOS</th><th>STATUS</th><th>CRIADO</th><th>AÇÃO</th></tr></thead><tbody>${orders.length ? orders.map((order) => `<tr><td>${escapeHtml(order.email)}</td><td>${escapeHtml(order.description)}</td><td>${formatCurrency(order.amountCents)}</td><td>${order.credits}</td><td><span class="status-tag status-${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td><td>${formatDate(order.createdAt)}</td><td>${order.status === "pending" ? `<button class="confirm-button" data-confirm-order="${order.id}">Confirmar pagamento</button>` : "—"}</td></tr>`).join("") : '<tr><td colspan="7">Nenhum pedido.</td></tr>'}</tbody></table>`;

  const users = state.admin?.users || [];
  elements.adminUsers.innerHTML = `<table class="admin-table"><thead><tr><th>USUÁRIO</th><th>FUNÇÃO</th><th>SALDO</th><th>UTILIZADO</th><th>CADASTRO</th><th>AÇÕES</th></tr></thead><tbody>${users.length ? users.map((user) => `<tr><td><strong>${escapeHtml(user.fullName || "Sem nome")}</strong><br><span>${escapeHtml(user.email)}</span></td><td>${escapeHtml(user.role)}</td><td>${Number(user.balance || 0).toLocaleString("pt-BR")}</td><td>${Number(user.lifetimeUsed || 0).toLocaleString("pt-BR")}</td><td>${formatDate(user.createdAt)}</td><td><button data-adjust-user="${user.id}" data-user-label="${escapeHtml(user.email)}">Ajustar créditos</button> <button data-toggle-role="${user.id}" data-next-role="${user.role === "admin" ? "user" : "admin"}">${user.role === "admin" ? "Remover admin" : "Tornar admin"}</button></td></tr>`).join("") : '<tr><td colspan="6">Nenhum usuário.</td></tr>'}</tbody></table>`;
}

elements.authButton.addEventListener("click", () => { setAuthMode("signin"); openDialog(elements.authDialog); });
elements.accountButton.addEventListener("click", async () => { openDialog(elements.accountDialog); await loadAccount(); });
elements.adminButton.addEventListener("click", async () => { openDialog(elements.adminDialog); await loadAdmin(); });
elements.downloadButton.href = APP_CONFIG.releaseUrl;

$$('[data-auth-tab]').forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authTab)));
$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog)?.close()));
$$('[data-admin-tab]').forEach((button) => button.addEventListener("click", () => {
  $$('[data-admin-tab]').forEach((item) => item.classList.toggle("active", item === button));
  $$('[data-admin-page]').forEach((page) => page.classList.toggle("active", page.dataset.adminPage === button.dataset.adminTab));
}));

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.authSubmit.disabled = true;
  elements.authSubmit.textContent = state.authMode === "signup" ? "Criando…" : "Entrando…";
  elements.authFeedback.textContent = "";
  let result;
  if (state.authMode === "signup") {
    const redirect = location.origin !== "null" ? location.origin : undefined;
    result = await supabase.auth.signUp({
      email: elements.emailInput.value.trim(), password: elements.passwordInput.value,
      options: { data: { full_name: elements.nameInput.value.trim() }, ...(redirect ? { emailRedirectTo: redirect } : {}) }
    });
  } else {
    result = await supabase.auth.signInWithPassword({ email: elements.emailInput.value.trim(), password: elements.passwordInput.value });
  }
  elements.authSubmit.disabled = false;
  elements.authSubmit.textContent = state.authMode === "signup" ? "Criar conta" : "Entrar";
  if (result.error) {
    elements.authFeedback.textContent = friendlyError(result.error);
    elements.authFeedback.className = "form-feedback error";
    return;
  }
  if (state.authMode === "signup" && !result.data.session) {
    elements.authFeedback.textContent = "Conta criada. Confira seu e-mail para confirmar o cadastro.";
    elements.authFeedback.className = "form-feedback success";
    return;
  }
  elements.authDialog.close();
  showToast(state.authMode === "signup" ? "Conta criada com sucesso." : "Login realizado com sucesso.");
});

elements.signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  elements.accountDialog.close();
  showToast("Sessão encerrada.");
});

elements.plansGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-buy-plan]");
  if (button) buyPlan(button.dataset.buyPlan);
});

elements.adminDialog.addEventListener("click", async (event) => {
  const confirmButton = event.target.closest("[data-confirm-order]");
  if (confirmButton) {
    if (!confirm("Confirma que o pagamento foi recebido? Essa ação adicionará os créditos.")) return;
    confirmButton.disabled = true;
    const { error } = await supabase.rpc("admin_confirm_order", { p_order_id: confirmButton.dataset.confirmOrder });
    if (error) showToast(friendlyError(error), true); else { showToast("Pagamento confirmado e créditos liberados."); await loadAdmin(); }
    return;
  }
  const adjustButton = event.target.closest("[data-adjust-user]");
  if (adjustButton) {
    elements.adjustUserId.value = adjustButton.dataset.adjustUser;
    elements.adjustUserLabel.textContent = adjustButton.dataset.userLabel;
    elements.adjustAmount.value = ""; elements.adjustReason.value = "";
    openDialog(elements.adjustDialog);
    return;
  }
  const roleButton = event.target.closest("[data-toggle-role]");
  if (roleButton) {
    if (!confirm(`Alterar este usuário para ${roleButton.dataset.nextRole}?`)) return;
    const { error } = await supabase.rpc("admin_set_role", { p_user_id: roleButton.dataset.toggleRole, p_role: roleButton.dataset.nextRole });
    if (error) showToast(friendlyError(error), true); else { showToast("Função atualizada."); await loadAdmin(); }
  }
});

elements.adjustForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const { error } = await supabase.rpc("admin_adjust_credits", {
    p_user_id: elements.adjustUserId.value, p_delta: Number(elements.adjustAmount.value), p_reason: elements.adjustReason.value.trim()
  });
  if (error) return showToast(friendlyError(error), true);
  elements.adjustDialog.close();
  showToast("Saldo atualizado.");
  await loadAdmin();
});

supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => renderSession(session), 0); });

(async function initialize() {
  await loadCatalog();
  const { data } = await supabase.auth.getSession();
  await renderSession(data.session);
  const params = new URLSearchParams(location.search);
  if (!data.session && params.get("signup") === "1") {
    setAuthMode("signup");
    openDialog(elements.authDialog);
  }
})();

