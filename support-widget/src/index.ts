declare global {
  interface Window {
    TagoIO?: {
      onStart?: (callback: (widget: TagoWidget) => void) => void;
      onError?: (callback: (error: unknown) => void) => void;
      ready?: (options?: unknown) => void;
    };
  }
}

type WidgetMode = "support-center" | "asana-whatsapp";

type TagoWidget = {
  display?: Record<string, unknown>;
  parameters?: unknown;
  config?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

type SupportConfig = {
  mode: WidgetMode;
  asanaToken: string;
  asanaWorkspaceId: string;
  asanaProjectId: string;
  asanaAssignee: string;
  whatsappNumber: string;
  companyName: string;
};

type SupportTicket = {
  name: string;
  email: string;
  phone: string;
  company: string;
  subject: string;
  category: string;
  priority: string;
  description: string;
};

type AsanaTask = {
  gid: string;
  permalink_url?: string;
  name?: string;
};

const HARDCODED_CONFIG: SupportConfig = {
  // Preencha estes valores antes de gerar o build para publicar na TagoIO.
  mode: "support-center",
  asanaToken: "",
  asanaWorkspaceId: "",
  asanaProjectId: "",
  asanaAssignee: "",
  whatsappNumber: "",
  companyName: "IrriGate2020"
};

function getAppRoot(): HTMLElement {
  const existingRoot = document.getElementById("root");
  if (existingRoot) {
    return existingRoot;
  }

  const createdRoot = document.createElement("div");
  createdRoot.id = "root";
  document.body.appendChild(createdRoot);
  return createdRoot;
}

const styles = `
  :root {
    color-scheme: light;
    font-family: Inter, "Segoe UI", Arial, sans-serif;
    background: #f6f8fb;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-width: 280px;
    background: #f6f8fb;
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  .support-shell {
    min-height: 100vh;
    color: #182230;
    background:
      linear-gradient(135deg, rgba(34, 101, 163, 0.10), transparent 34%),
      linear-gradient(315deg, rgba(36, 164, 104, 0.10), transparent 30%),
      #f6f8fb;
    padding: 18px;
  }

  .support-layout {
    width: min(980px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 16px;
    align-items: start;
  }

  .support-layout.compact {
    grid-template-columns: minmax(0, 620px);
    justify-content: center;
  }

  .support-panel,
  .support-side,
  .support-config {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #d9e2ec;
    border-radius: 8px;
    box-shadow: 0 14px 36px rgba(15, 23, 42, 0.08);
  }

  .support-panel {
    overflow: hidden;
  }

  .support-header {
    background: #123a5f;
    color: #ffffff;
    padding: 18px;
  }

  .support-header h1 {
    font-size: 22px;
    line-height: 1.2;
    margin: 0 0 6px;
    letter-spacing: 0;
  }

  .support-header p {
    margin: 0;
    color: rgba(255, 255, 255, 0.78);
    font-size: 13px;
  }

  .support-form {
    padding: 18px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .support-form.compact {
    grid-template-columns: 1fr;
  }

  .field {
    min-width: 0;
  }

  .field.full {
    grid-column: 1 / -1;
  }

  label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #334155;
    margin: 0 0 6px;
  }

  input,
  textarea,
  select {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #182230;
    outline: none;
    padding: 10px 11px;
    min-height: 40px;
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }

  textarea {
    min-height: 110px;
    resize: vertical;
  }

  input:focus,
  textarea:focus,
  select:focus {
    border-color: #2870b8;
    box-shadow: 0 0 0 3px rgba(40, 112, 184, 0.14);
  }

  .actions {
    grid-column: 1 / -1;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .button {
    border: 0;
    border-radius: 6px;
    min-height: 42px;
    padding: 0 16px;
    font-weight: 800;
    cursor: pointer;
    color: #ffffff;
    background: #2870b8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-decoration: none;
    transition: transform 120ms ease, filter 120ms ease;
  }

  .button:hover {
    filter: brightness(1.03);
  }

  .button:active {
    transform: translateY(1px);
  }

  .button.secondary {
    background: #1f8f61;
  }

  .button.ghost {
    background: #e8eef5;
    color: #123a5f;
  }

  .button:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  .support-side,
  .support-config {
    padding: 16px;
  }

  .support-side h2,
  .support-config h2 {
    margin: 0 0 10px;
    font-size: 15px;
    color: #123a5f;
  }

  .status {
    grid-column: 1 / -1;
    border-radius: 6px;
    padding: 11px 12px;
    font-size: 13px;
    display: none;
  }

  .status.show {
    display: block;
  }

  .status.success {
    color: #14532d;
    background: #dcfce7;
    border: 1px solid #bbf7d0;
  }

  .status.error {
    color: #7f1d1d;
    background: #fee2e2;
    border: 1px solid #fecaca;
  }

  .status.info {
    color: #123a5f;
    background: #e0f2fe;
    border: 1px solid #bae6fd;
  }

  .support-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 10px;
  }

  .support-list li {
    border-left: 3px solid #2870b8;
    padding: 4px 0 4px 10px;
    color: #475569;
    font-size: 13px;
    line-height: 1.42;
  }

  .config-grid {
    display: grid;
    gap: 10px;
  }

  .config-grid label {
    margin-bottom: 5px;
  }

  .mini-text {
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
    margin: 0 0 12px;
  }

  .whatsapp-block {
    display: grid;
    gap: 10px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid #e2e8f0;
  }

  @media (max-width: 820px) {
    .support-shell {
      padding: 12px;
    }

    .support-layout {
      grid-template-columns: 1fr;
    }

    .support-form {
      grid-template-columns: 1fr;
    }

    .actions {
      justify-content: stretch;
    }

    .button {
      width: 100%;
    }
  }
`;

function normalizeMode(value: unknown): WidgetMode {
  return value === "asana-whatsapp" ? "asana-whatsapp" : "support-center";
}

function toConfigObject(source: unknown): Record<string, string> {
  const output: Record<string, string> = {};

  if (!source || typeof source !== "object") {
    return output;
  }

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const key = String(item.key || item.name || item.label || item.variable || "");
      const value = item.value ?? item.default ?? item.content;
      if (key && value !== undefined && value !== null) {
        output[key] = String(value);
      }
    }
    return output;
  }

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object" && "value" in value) {
      output[key] = String((value as Record<string, unknown>).value ?? "");
    } else if (typeof value !== "object") {
      output[key] = String(value);
    }
  }

  return output;
}

function readWidgetConfig(widget?: TagoWidget): Partial<SupportConfig> {
  if (!widget) return {};

  const display = widget.display || {};
  const candidates = [
    display.parameters,
    display.options,
    display.settings,
    widget.parameters,
    widget.config,
    widget.data
  ];

  return candidates.reduce<Partial<SupportConfig>>((acc, candidate) => {
    return { ...acc, ...toConfigObject(candidate) };
  }, {});
}

function readQueryConfig(): Partial<SupportConfig> {
  const params = new URLSearchParams(window.location.search);
  const config: Partial<SupportConfig> = {};

  for (const key of Object.keys(HARDCODED_CONFIG) as Array<keyof SupportConfig>) {
    const value = params.get(key);
    if (value !== null) {
      config[key] = value as never;
    }
  }

  return config;
}

function resolveConfig(widget?: TagoWidget): SupportConfig {
  const merged = {
    ...HARDCODED_CONFIG,
    ...readWidgetConfig(widget),
    ...readQueryConfig()
  };

  return {
    ...merged,
    mode: normalizeMode(merged.mode)
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNotes(ticket: SupportTicket, widget?: TagoWidget): string {
  const lines = [
    `Solicitante: ${ticket.name}`,
    `Email: ${ticket.email}`,
    `Telefone: ${ticket.phone || "Nao informado"}`,
    `Empresa/Unidade: ${ticket.company || "Nao informado"}`,
    `Categoria: ${ticket.category}`,
    `Prioridade: ${ticket.priority}`,
    "",
    "Descricao:",
    ticket.description
  ];

  const dashboardId = typeof widget?.dashboard === "string" ? widget.dashboard : "";
  if (dashboardId) {
    lines.push("", `Dashboard TagoIO: ${dashboardId}`);
  }

  return lines.join("\n");
}

async function createAsanaTask(config: SupportConfig, ticket: SupportTicket, widget?: TagoWidget): Promise<AsanaTask> {
  if (!config.asanaToken || !config.asanaWorkspaceId || !config.asanaProjectId) {
    throw new Error("Configure asanaToken, asanaWorkspaceId e asanaProjectId antes de enviar.");
  }

  const taskData: Record<string, unknown> = {
    name: `[${ticket.priority}] ${ticket.subject}`,
    notes: formatNotes(ticket, widget),
    workspace: config.asanaWorkspaceId,
    projects: [config.asanaProjectId]
  };

  if (config.asanaAssignee) {
    taskData.assignee = config.asanaAssignee;
  }

  const response = await fetch("https://app.asana.com/api/1.0/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.asanaToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ data: taskData })
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = json?.errors?.[0]?.message || json?.message || `Erro HTTP ${response.status}`;
    throw new Error(`Asana recusou a criacao da tarefa: ${message}`);
  }

  if (!json?.data?.gid) {
    throw new Error("Asana respondeu sem o GID da tarefa criada.");
  }

  return json.data as AsanaTask;
}

function readTicket(form: HTMLFormElement): SupportTicket {
  const data = new FormData(form);
  const get = (key: string) => String(data.get(key) || "").trim();

  return {
    name: get("name"),
    email: get("email"),
    phone: get("phone"),
    company: get("company"),
    subject: get("subject"),
    category: get("category"),
    priority: get("priority"),
    description: get("description")
  };
}

function validateTicket(ticket: SupportTicket): string | null {
  if (!ticket.name) return "Informe o nome do solicitante.";
  if (!ticket.email) return "Informe o email de contato.";
  if (!ticket.subject) return "Informe o assunto do chamado.";
  if (!ticket.description) return "Descreva o problema ou solicitacao.";
  return null;
}

function createWhatsappUrl(config: SupportConfig, ticket?: Partial<SupportTicket>): string {
  const number = config.whatsappNumber.replace(/\D/g, "");
  const message = [
    `Olá, ${config.companyName}. Preciso de suporte.`,
    ticket?.subject ? `Assunto: ${ticket.subject}` : "",
    ticket?.priority ? `Prioridade: ${ticket.priority}` : ""
  ].filter(Boolean).join("\n");

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function showStatus(rootElement: HTMLElement, type: "success" | "error" | "info", message: string): void {
  const status = rootElement.querySelector<HTMLElement>("[data-status]");
  if (!status) return;
  status.className = `status show ${type}`;
  status.innerHTML = message;
}

function setLoading(form: HTMLFormElement, loading: boolean): void {
  const submit = form.querySelector<HTMLButtonElement>("[data-submit]");
  if (submit) {
    submit.disabled = loading;
    submit.textContent = loading ? "Enviando..." : "Abrir chamado";
  }
}

function renderSupportInfo(config: SupportConfig): string {
  return `
    <aside class="support-side">
      <h2>Fluxo do atendimento</h2>
      <ul class="support-list">
        <li>O formulario cria automaticamente uma tarefa no projeto configurado no Asana.</li>
        <li>A descricao inclui contato, prioridade e categoria para acelerar a triagem.</li>
        <li>Use prioridade critica apenas quando houver impacto operacional imediato.</li>
      </ul>
      ${config.mode === "asana-whatsapp" ? renderWhatsappBlock(config) : ""}
    </aside>
  `;
}

function renderWhatsappBlock(config: SupportConfig): string {
  const disabled = config.whatsappNumber ? "" : "disabled";
  return `
    <div class="whatsapp-block">
      <h2>Contato rápido</h2>
      <p class="mini-text">Abre uma conversa no WhatsApp da empresa com uma mensagem inicial preenchida.</p>
      <button class="button secondary" type="button" data-whatsapp ${disabled}>Falar no WhatsApp</button>
    </div>
  `;
}

function renderForm(config: SupportConfig, widget?: TagoWidget): string {
  const isCompact = config.mode === "asana-whatsapp";

  return `
    <main class="support-panel">
      <header class="support-header">
        <h1>${isCompact ? "Suporte Asana + WhatsApp" : "Central de Suporte"}</h1>
        <p>${config.companyName} - abertura de chamados integrada ao Asana.</p>
      </header>
      <form class="support-form ${isCompact ? "compact" : ""}" data-support-form>
        <div class="field">
          <label for="name">Nome</label>
          <input id="name" name="name" required autocomplete="name" />
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required autocomplete="email" />
        </div>
        <div class="field">
          <label for="phone">Telefone</label>
          <input id="phone" name="phone" autocomplete="tel" />
        </div>
        <div class="field">
          <label for="company">Empresa/Unidade</label>
          <input id="company" name="company" autocomplete="organization" />
        </div>
        <div class="field full">
          <label for="subject">Assunto</label>
          <input id="subject" name="subject" required maxlength="120" />
        </div>
        <div class="field">
          <label for="category">Categoria</label>
          <select id="category" name="category">
            <option>Suporte tecnico</option>
            <option>Operacao</option>
            <option>Instalacao</option>
            <option>Financeiro</option>
            <option>Outro</option>
          </select>
        </div>
        <div class="field">
          <label for="priority">Prioridade</label>
          <select id="priority" name="priority">
            <option>Normal</option>
            <option>Alta</option>
            <option>Critica</option>
          </select>
        </div>
        <div class="field full">
          <label for="description">Descrição</label>
          <textarea id="description" name="description" required></textarea>
        </div>
        <div class="status" data-status></div>
        <div class="actions">
          ${isCompact ? `<button class="button secondary" type="button" data-whatsapp ${config.whatsappNumber ? "" : "disabled"}>WhatsApp</button>` : ""}
          <button class="button" type="submit" data-submit>Abrir chamado</button>
        </div>
      </form>
    </main>
  `;
}

function bindWhatsapp(container: HTMLElement, config: SupportConfig): void {
  const buttons = container.querySelectorAll<HTMLButtonElement>("[data-whatsapp]");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!config.whatsappNumber) return;
      const form = container.querySelector<HTMLFormElement>("[data-support-form]");
      const ticket = form ? readTicket(form) : undefined;
      window.open(createWhatsappUrl(config, ticket), "_blank", "noopener,noreferrer");
    });
  });
}

function bindSupportForm(container: HTMLElement, config: SupportConfig, widget?: TagoWidget): void {
  const form = container.querySelector<HTMLFormElement>("[data-support-form]");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const ticket = readTicket(form);
    const validationError = validateTicket(ticket);

    if (validationError) {
      showStatus(container, "error", escapeHtml(validationError));
      return;
    }

    setLoading(form, true);
    showStatus(container, "info", "Enviando chamado para o Asana...");

    try {
      const task = await createAsanaTask(config, ticket, widget);
      const taskUrl = task.permalink_url || `https://app.asana.com/0/${config.asanaProjectId}/${task.gid}`;
      showStatus(
        container,
        "success",
        `Chamado aberto no Asana. <a href="${escapeHtml(taskUrl)}" target="_blank" rel="noreferrer">Ver tarefa</a>.`
      );
      form.reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha inesperada ao enviar chamado.";
      showStatus(container, "error", escapeHtml(message));
    } finally {
      setLoading(form, false);
    }
  });
}

function render(widget?: TagoWidget): void {
  const appRoot = getAppRoot();
  const config = resolveConfig(widget);
  const needsConfig = !config.asanaToken || !config.asanaWorkspaceId || !config.asanaProjectId;

  appRoot.innerHTML = `
    <style>${styles}</style>
    <div class="support-shell">
      <div class="support-layout ${config.mode === "asana-whatsapp" ? "compact" : ""}">
        ${renderForm(config, widget)}
        ${renderSupportInfo(config)}
      </div>
    </div>
  `;

  bindSupportForm(appRoot, config, widget);
  bindWhatsapp(appRoot, config);

  if (needsConfig) {
    showStatus(appRoot, "info", "Preencha o HARDCODED_CONFIG no codigo para habilitar a abertura automatica de chamados.");
  }
}

function start(): void {
  if (window.TagoIO) {
    window.TagoIO.onStart?.((widget: TagoWidget) => {
      render(widget);
    });

    window.TagoIO.onError?.((error: unknown) => {
      console.error("[SupportWidget] TagoIO error", error);
    });

    window.TagoIO.ready?.({
      header: {
        color: "#123a5f"
      }
    });
  } else {
    render();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

export {};
