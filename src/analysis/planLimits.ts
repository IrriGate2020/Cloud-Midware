export type PlanId = "essencial" | "avancado" | "premium";
export type PlanFeature = "alerts" | "reports";

export interface PlanDefinition {
    id: PlanId;
    label: string;
    description: string;
    deviceLimit: number;
    alertLimit: number;
    reportLimit: number;
    retentionDays: number;
    supportAsana: boolean;
    supportWhatsapp: boolean;
}

export interface PlanUsage {
    alerts: number;
    reports: number;
}

export interface PlanStatus {
    plan: PlanDefinition;
    usage: PlanUsage;
    remaining: {
        alerts: number;
        reports: number;
    };
}

const PLAN_STATUS_VARIABLES = [
    "plano_status",
    "plano_alertas_usados",
    "plano_relatorios_usados",
    "plano_alertas_restantes",
    "plano_relatorios_restantes",
    "plano_devices_limite",
    "plano_retencao_dias"
];

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
    essencial: {
        id: "essencial",
        label: "Essencial(Visualização)",
        description: "Plano essencial para visualização de dados por sensor, limitado a 5 sensores.",
        deviceLimit: 5,
        alertLimit: 0,
        reportLimit: 0,
        retentionDays: 7,
        supportAsana: false,
        supportWhatsapp: false
    },
    avancado: {
        id: "avancado",
        label: "Avançado",
        description: "Plano avançado com até 10 sensores, 10 alertas, 1 relatório, abertura de chamados diretamente com o time de suporte e atendimento crítico em até 6 horas úteis.",
        deviceLimit: 10,
        alertLimit: 10,
        reportLimit: 1,
        retentionDays: 30,
        supportAsana: true,
        supportWhatsapp: false
    },
    premium: {
        id: "premium",
        label: "Premium",
        description: "Plano premium com até 30 sensores, 30 alertas, 5 relatórios, suporte integrado ao Asana, abertura de chamados integrado com o Whatsapp e atendimento crítico em até 3 horas úteis ou até 6 horas em dias não úteis.",
        deviceLimit: 30,
        alertLimit: 30,
        reportLimit: 5,
        retentionDays: 90,
        supportAsana: true,
        supportWhatsapp: true
    }
};

const PLAN_TAG_KEYS = [
    "plan",
    "plano",
    "plan_id",
    "plano_id",
    "plan_name",
    "plano_nome",
    "plan_device_limit",
    "plan_alert_limit",
    "plan_report_limit",
    "plan_retention_days",
    "custom_alert_limit",
    "custom_report_limit",
    "custom_retention_days",
    "support_asana",
    "support_whatsapp"
];

export function normalizeText(value: any): string {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

export function normalizePlanId(value: any): PlanId | null {
    const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    if (["essencial", "essencial_visualizacao", "visualizacao", "visualizacao_dados", "gratis", "gratuito", "free"].includes(normalized)) {
        return "essencial";
    }

    if (["avancado", "intermediario", "intermediate", "medio"].includes(normalized)) {
        return "avancado";
    }

    if (["premium", "diamante", "diamond"].includes(normalized)) {
        return "premium";
    }

    return null;
}

export function getPlanDefinition(value: any): PlanDefinition | null {
    const planId = normalizePlanId(value);
    return planId ? PLAN_DEFINITIONS[planId] : null;
}

function parseLimit(value: any, fallback: number): number {
    if (value === undefined || value === null || value === "") return fallback;
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function parseBoolean(value: any, fallback: boolean): boolean {
    if (value === undefined || value === null || value === "") return fallback;
    const normalized = normalizeText(value);
    if (["true", "1", "sim", "yes", "y", "ativo", "habilitado"].includes(normalized)) return true;
    if (["false", "0", "nao", "não", "no", "n", "inativo", "desabilitado"].includes(normalized)) return false;
    return fallback;
}

function getDeviceRetentionConfig(retentionDays: number): { chunk_period: "day" | "month"; chunk_retention: number } {
    const days = Math.max(1, Math.floor(Number(retentionDays) || 1));

    if (days > 36) {
        return {
            chunk_period: "month",
            chunk_retention: Math.max(1, Math.ceil(days / 30))
        };
    }

    return {
        chunk_period: "day",
        chunk_retention: days
    };
}

export function getTagValue(tags: any[] | undefined, key: string): string | undefined {
    const tag = (tags || []).find((item) => normalizeText(item?.key) === normalizeText(key));
    if (tag?.value === undefined || tag?.value === null || tag?.value === "") return undefined;
    return String(tag.value);
}

export function getPlanFromTags(tags: any[] | undefined): PlanDefinition | null {
    for (const key of PLAN_TAG_KEYS) {
        const value = getTagValue(tags, key);
        const plan = getPlanDefinition(value);
        if (plan) {
            return {
                ...plan,
                deviceLimit: parseLimit(getTagValue(tags, "plan_device_limit"), plan.deviceLimit),
                alertLimit: parseLimit(
                    getTagValue(tags, "plan_alert_limit") || getTagValue(tags, "custom_alert_limit"),
                    plan.alertLimit
                ),
                reportLimit: parseLimit(
                    getTagValue(tags, "plan_report_limit") || getTagValue(tags, "custom_report_limit"),
                    plan.reportLimit
                ),
                retentionDays: parseLimit(
                    getTagValue(tags, "plan_retention_days") || getTagValue(tags, "custom_retention_days"),
                    plan.retentionDays
                ),
                supportAsana: parseBoolean(getTagValue(tags, "support_asana"), plan.supportAsana),
                supportWhatsapp: parseBoolean(getTagValue(tags, "support_whatsapp"), plan.supportWhatsapp)
            };
        }
    }

    return null;
}

function getLegacyPlanId(planId: PlanId): string {
    if (planId === "essencial") return "visualizacao";
    if (planId === "avancado") return "intermediario";
    if (planId === "premium") return "diamante";
    return planId;
}

function getPlanFeatureTags(plan: PlanDefinition): any[] {
    const alertsEnabled = plan.alertLimit > 0;
    const reportsEnabled = plan.reportLimit > 0;
    const supportEnabled = plan.supportAsana || plan.supportWhatsapp;

    return [
        { key: "alerts_enabled", value: String(alertsEnabled) },
        { key: "alertas_enabled", value: String(alertsEnabled) },
        { key: "reports_enabled", value: String(reportsEnabled) },
        { key: "relatorios_enabled", value: String(reportsEnabled) },
        { key: "support_enabled", value: String(supportEnabled) },
        { key: "suporte_enabled", value: String(supportEnabled) }
    ];
}
export function buildPlanTags(plan: PlanDefinition, organization: { id?: string; name?: string; deviceId?: string }): any[] {
    const legacyPlanId = getLegacyPlanId(plan.id);
    const tags = [
        { key: "plan", value: plan.id },
        { key: "plano", value: plan.id },
        { key: "plan", value: legacyPlanId },
        { key: "plano", value: legacyPlanId },
        { key: "plan_legacy", value: legacyPlanId },
        { key: "plano_legacy", value: legacyPlanId },
        { key: "plan_name", value: plan.label },
        { key: "plan_device_limit", value: String(plan.deviceLimit) },
        { key: "plan_alert_limit", value: String(plan.alertLimit) },
        { key: "plan_report_limit", value: String(plan.reportLimit) },
        { key: "plan_retention_days", value: String(plan.retentionDays) },
        { key: "support_asana", value: String(plan.supportAsana) },
        { key: "support_whatsapp", value: String(plan.supportWhatsapp) },
        ...getPlanFeatureTags(plan)
    ];

    if (organization.id) {
        tags.push({ key: "organization_id", value: organization.id });
    }

    if (organization.name) {
        tags.push({ key: "organization_name", value: organization.name });
    }

    if (organization.deviceId) {
        tags.push({ key: "organization_device", value: organization.deviceId });
    }

    return tags;
}

export function upsertTags(tags: any[] | undefined, updates: any[]): any[] {
    const updateKeys = new Set(updates.map((tag) => normalizeText(tag.key)));
    return [
        ...(tags || []).filter((tag) => !updateKeys.has(normalizeText(tag?.key))),
        ...updates
    ];
}

export function getOrganizationDeviceIdFromTags(tags: any[] | undefined): string | undefined {
    return (
        getTagValue(tags, "organization_device") ||
        getTagValue(tags, "organization_id") ||
        getTagValue(tags, "org_id") ||
        getTagValue(tags, "company_id")
    );
}

export async function resolveExistingDeviceId(resources: any, candidates: Array<string | undefined | null>, fallbackDeviceId: string): Promise<string> {
    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean).map((item) => String(item))));

    for (const candidate of uniqueCandidates) {
        try {
            await resources.devices.info(candidate);
            return candidate;
        } catch (_) {
            // Algumas tags guardam o ID/nome da organizacao, nao o ID do device.
        }
    }

    return fallbackDeviceId;
}

export async function findOrganizationDeviceIdByGroupId(resources: any, groupDeviceId: string): Promise<string | null> {
    let page = 1;

    while (true) {
        const devices = await resources.devices.list({
            page,
            amount: 100,
            fields: ["id", "name", "tags"]
        });

        for (const device of devices) {
            if (device.id === groupDeviceId) continue;

            try {
                const groupRefs = await resources.devices.getDeviceData(device.id, {
                    variables: ["group_id"],
                    qty: 20
                });

                const hasGroupRef = (groupRefs || []).some((item: any) => String(item?.value || "") === groupDeviceId);
                if (hasGroupRef) {
                    return device.id;
                }
            } catch (_) {
                // Ignora devices sem permissão/dados compatíveis.
            }
        }

        if (devices.length < 100) break;
        page += 1;
    }

    return null;
}

export async function resolveOrganizationDeviceId(resources: any, options: {
    explicitCandidates?: Array<string | undefined | null>;
    groupDeviceId?: string;
    fallbackDeviceId?: string;
}): Promise<string> {
    const explicitCandidates = Array.from(new Set((options.explicitCandidates || [])
        .filter(Boolean)
        .map((item) => String(item))
        .filter((item) => item !== options.groupDeviceId)));

    for (const candidate of explicitCandidates) {
        try {
            await resources.devices.info(candidate);
            return candidate;
        } catch (_) {
            // Algumas tags guardam nome/id lógico da organização, não ID de device.
        }
    }

    if (options.groupDeviceId) {
        const organizationDeviceId = await findOrganizationDeviceIdByGroupId(resources, options.groupDeviceId);
        if (organizationDeviceId) {
            return organizationDeviceId;
        }
    }

    return options.fallbackDeviceId || options.groupDeviceId || "";
}

function getDataTimestamp(data: any): Date | null {
    const rawDate = data?.metadata?.reset_at || data?.metadata?.created_at || data?.time || data?.created_at;
    if (!rawDate) return null;

    const date = new Date(rawDate);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function getMonthlyUsagePeriodStart(referenceDate = new Date()): Date {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit"
    }).formatToParts(referenceDate);
    const year = Number(parts.find((part) => part.type === "year")?.value || referenceDate.getUTCFullYear());
    const month = Number(parts.find((part) => part.type === "month")?.value || referenceDate.getUTCMonth() + 1);

    return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
}

export async function getPlanUsagePeriodStart(resources: any, organizationDeviceId: string): Promise<Date> {
    const monthlyStart = getMonthlyUsagePeriodStart();

    try {
        const resets = await resources.devices.getDeviceData(organizationDeviceId, {
            variables: ["plano_reset_mensal"],
            qty: 20
        });
        const resetDates = (resets || [])
            .map((item: any) => getDataTimestamp(item))
            .filter((date: Date | null): date is Date => Boolean(date && date >= monthlyStart))
            .sort((a: Date, b: Date) => b.getTime() - a.getTime());

        return resetDates[0] || monthlyStart;
    } catch (_) {
        return monthlyStart;
    }
}

export function countActiveData(data: any[], periodStart?: Date): number {
    return data.filter((item) => {
        if (item?.metadata?.deleted || item?.metadata?.disabled) return false;
        if (periodStart) {
            const timestamp = getDataTimestamp(item);
            if (!timestamp || timestamp < periodStart) return false;
        }
        return !["disabled", "deleted", "removed"].includes(normalizeText(item?.value));
    }).length;
}

async function deleteDeviceDataIds(resources: any, deviceId: string, ids: string[]): Promise<number> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    let deleted = 0;

    for (let index = 0; index < uniqueIds.length; index += 100) {
        const batch = uniqueIds.slice(index, index + 100);
        if (!batch.length) continue;

        await resources.devices.deleteDeviceData(deviceId, { ids: batch });
        deleted += batch.length;
    }

    return deleted;
}

export async function deleteDeviceDataByVariables(resources: any, deviceId: string, variables: string[], filter?: (item: any) => boolean): Promise<number> {
    const ids: string[] = [];
    const qty = 1000;
    let skip = 0;

    while (skip < 50000) {
        const data = await resources.devices.getDeviceData(deviceId, {
            variables,
            qty,
            skip,
            ordination: "descending"
        });

        ids.push(...(data || [])
            .filter((item: any) => filter ? filter(item) : true)
            .map((item: any) => item?.id)
            .filter(Boolean)
            .map((id: any) => String(id)));

        if ((data || []).length < qty) break;
        skip += qty;
    }

    return deleteDeviceDataIds(resources, deviceId, ids);
}

export async function getOrganizationAlertSourceDeviceIds(resources: any, organizationDeviceId: string): Promise<string[]> {
    const ids: string[] = [];

    try {
        const groupRefs = await resources.devices.getDeviceData(organizationDeviceId, {
            variables: ["group_id"],
            qty: 9999
        });

        ids.push(...(groupRefs || [])
            .map((item: any) => item?.value)
            .filter((value: any) => value !== undefined && value !== null && value !== "")
            .map((value: any) => String(value)));
    } catch (_) {
        // Nem toda organiza??o tem group_id salvo como dado.
    }

    try {
        const organizationAlertRecords = await resources.devices.getDeviceData(organizationDeviceId, {
            variables: ["alertas"],
            qty: 9999
        });

        ids.push(...(organizationAlertRecords || [])
            .map((item: any) => item?.metadata?.source_group_device)
            .filter((value: any) => value !== undefined && value !== null && value !== "")
            .map((value: any) => String(value)));
    } catch (_) {
        // Registros antigos podem n?o ter copia de uso na organiza??o.
    }

    const uniqueIds = Array.from(new Set(ids.filter((id) => id && id !== organizationDeviceId)));
    return uniqueIds.length ? uniqueIds : [organizationDeviceId];
}

export async function getPlanUsage(resources: any, organizationDeviceId: string): Promise<PlanUsage> {
    const alertSourceDeviceIds = await getOrganizationAlertSourceDeviceIds(resources, organizationDeviceId);
    const periodStart = await getPlanUsagePeriodStart(resources, organizationDeviceId);
    const [alertGroups, reports] = await Promise.all([
        Promise.all(alertSourceDeviceIds.map((deviceId) => 
            resources.devices.getDeviceData(deviceId, { variables: ["alertas"], qty: 9999 }).catch(() => [])
        )),
        resources.devices.getDeviceData(organizationDeviceId, { variables: ["relatorios"], qty: 9999 })
    ]);

    return {
        alerts: countActiveData(alertGroups.flat(), periodStart),
        reports: countActiveData(reports || [], periodStart)
    };
}

export function getRemaining(plan: PlanDefinition, usage: PlanUsage): PlanStatus["remaining"] {
    return {
        alerts: Math.max(plan.alertLimit - usage.alerts, 0),
        reports: Math.max(plan.reportLimit - usage.reports, 0)
    };
}

export async function publishPlanStatus(resources: any, organizationDeviceId: string, plan: PlanDefinition, usageOverride?: PlanUsage): Promise<PlanStatus> {
    const usage = usageOverride || await getPlanUsage(resources, organizationDeviceId);
    const remaining = getRemaining(plan, usage);
    const now = new Date().toISOString();
    const billingPeriodStart = (await getPlanUsagePeriodStart(resources, organizationDeviceId)).toISOString();
    const retentionConfig = getDeviceRetentionConfig(plan.retentionDays);

    await deleteDeviceDataByVariables(resources, organizationDeviceId, PLAN_STATUS_VARIABLES).catch(() => 0);

    await resources.devices.sendDeviceData(organizationDeviceId, [
        {
            variable: "plano_status",
            value: plan.label,
            metadata: {
                plan_id: plan.id,
                description: plan.description,
                device_limit: plan.deviceLimit,
                alert_limit: plan.alertLimit,
                report_limit: plan.reportLimit,
                retention_days: plan.retentionDays,
                retention_chunk_period: retentionConfig.chunk_period,
                retention_chunk_value: retentionConfig.chunk_retention,
                alerts_used: usage.alerts,
                reports_used: usage.reports,
                alerts_remaining: remaining.alerts,
                reports_remaining: remaining.reports,
                support_asana: plan.supportAsana,
                support_whatsapp: plan.supportWhatsapp,
                billing_period_start: billingPeriodStart,
                updated_at: now
            }
        },
        {
            variable: "plano_alertas_usados",
            value: usage.alerts,
            metadata: {
                remaining: remaining.alerts,
                limit: plan.alertLimit,
                plan_id: plan.id,
                billing_period_start: billingPeriodStart,
                updated_at: now
            }
        },
        {
            variable: "plano_relatorios_usados",
            value: usage.reports,
            metadata: {
                remaining: remaining.reports,
                limit: plan.reportLimit,
                plan_id: plan.id,
                billing_period_start: billingPeriodStart,
                updated_at: now
            }
        },
        {
            variable: "plano_alertas_restantes",
            value: remaining.alerts,
            metadata: {
                used: usage.alerts,
                limit: plan.alertLimit,
                plan_id: plan.id,
                billing_period_start: billingPeriodStart,
                updated_at: now
            }
        },
        {
            variable: "plano_relatorios_restantes",
            value: remaining.reports,
            metadata: {
                used: usage.reports,
                limit: plan.reportLimit,
                plan_id: plan.id,
                billing_period_start: billingPeriodStart,
                updated_at: now
            }
        },
        {
            variable: "plano_devices_limite",
            value: plan.deviceLimit,
            metadata: {
                plan_id: plan.id,
                note: "A contagem de sensores deve ser aplicada no fluxo que cria os sensores.",
                updated_at: now
            }
        },
        {
            variable: "plano_retencao_dias",
            value: plan.retentionDays,
            metadata: {
                plan_id: plan.id,
                retention_chunk_period: retentionConfig.chunk_period,
                retention_chunk_value: retentionConfig.chunk_retention,
                updated_at: now
            }
        }
    ]);

    return { plan, usage, remaining };
}

export async function enforcePlanLimit(resources: any, organizationDeviceId: string, feature: PlanFeature, fallbackPlan?: PlanDefinition | null, quantity = 1, persistFallbackTags = true): Promise<{
    allowed: boolean;
    plan?: PlanDefinition;
    status?: PlanStatus;
    message?: string;
}> {
    const organizationDevice = await resources.devices.info(organizationDeviceId);
    const planFromDevice = getPlanFromTags(organizationDevice.tags || []);
    const plan = planFromDevice || fallbackPlan || null;

    if (!plan) {
        return { allowed: true };
    }

    if (!planFromDevice && fallbackPlan && persistFallbackTags !== false) {
        await resources.devices.edit(organizationDeviceId, {
            tags: upsertTags(organizationDevice.tags || [], buildPlanTags(plan, {
                id: getTagValue(organizationDevice.tags, "organization_id") || organizationDeviceId,
                name: organizationDevice.name,
                deviceId: organizationDeviceId
            }))
        });
    }

    const usage = await getPlanUsage(resources, organizationDeviceId);
    const status: PlanStatus = {
        plan,
        usage,
        remaining: getRemaining(plan, usage)
    };
    const limit = feature === "alerts" ? plan.alertLimit : plan.reportLimit;
    const used = feature === "alerts" ? status.usage.alerts : status.usage.reports;
    const featureLabel = feature === "alerts" ? "alertas" : "relatórios";
    const requested = Math.max(1, quantity);

    if (limit <= 0 || used + requested > limit) {
        await publishPlanStatus(resources, organizationDeviceId, plan);

        return {
            allowed: false,
            plan,
            status,
            message: `Limite de ${featureLabel} atingido para o plano ${plan.label}: ${used}/${limit}. Solicitado: ${requested}.`
        };
    }

    return { allowed: true, plan, status };
}
