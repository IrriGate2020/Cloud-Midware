import { Analysis, Resources } from "@tago-io/sdk";
import {
    PLAN_DEFINITIONS,
    PlanDefinition,
    buildPlanTags,
    getPlanDefinition,
    getTagValue,
    normalizeText,
    publishPlanStatus,
    upsertTags
} from "./planLimits";

interface OrganizationRef {
    id?: string;
    name?: string;
    deviceId?: string;
    aliases?: Array<string | undefined>;
}

interface PlanAssignmentData {
    organization?: string;
    organization_device?: string;
    organization_name?: string;
    plan?: string;
    base_plan?: string;
    custom_alert_limit?: string;
    custom_report_limit?: string;
    custom_device_limit?: string;
    custom_retention_days?: string;
    support_asana?: string;
    support_whatsapp?: string;
    session_id?: string;
}

function getValue(scope: any[], names: string[]): any {
    const aliases = new Set(names.map((name) => normalizeFieldName(name)));
    const item = scope.find((x) => aliases.has(normalizeFieldName(x.variable)));
    return item?.value;
}

function normalizeFieldName(value: any): string {
    return normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function getString(scope: any[], names: string[]): string | undefined {
    const value = getValue(scope, names);
    if (value === undefined || value === null || value === "") return undefined;
    return String(value).trim();
}

function extractPlanAssignment(scope: any[]): PlanAssignmentData {
    const group = scope[0]?.group;
    const groupScope = group ? scope.filter((item) => item.group === group) : scope;

    return {
        organization: getString(groupScope, ["organization", "organization_id", "org", "org_id", "company", "company_id"]),
        organization_device: getString(groupScope, ["organization_device", "org_device", "group_device", "device_organization"]),
        organization_name: getString(groupScope, ["organization_name", "org_name", "company_name"]),
        plan: getString(groupScope, ["plan", "plan_id", "plano", "plano_id"]),
        base_plan: getString(groupScope, ["base_plan", "plan_base", "plano_base", "base_plano", "plano_base_custom", "base"]),
        custom_alert_limit: getString(groupScope, [
            "custom_alert_limit",
            "plan_alert_limit",
            "alert_limit",
            "limite_alertas",
            "limite_alerta",
            "limite_de_alertas",
            "limite_de_alerta",
            "alertas_limite",
            "alerta_limite",
            "limite_alertas_custom",
            "limite_alerta_custom",
            "plano_alertas_limite"
        ]),
        custom_report_limit: getString(groupScope, [
            "custom_report_limit",
            "plan_report_limit",
            "report_limit",
            "limite_relatorios",
            "limite_relatorio",
            "limite_de_relatorios",
            "limite_de_relatorio",
            "relatorios_limite",
            "relatorio_limite",
            "limite_relatorios_custom",
            "limite_relatorio_custom",
            "plano_relatorios_limite"
        ]),
        custom_device_limit: getString(groupScope, ["custom_device_limit", "plan_device_limit", "device_limit", "limite_sensores", "limite_sensor", "limite_devices", "limite_de_sensores", "limite_de_sensor"]),
        custom_retention_days: getString(groupScope, [
            "custom_retention_days",
            "plan_retention_days",
            "retention_days",
            "retencao_dias",
            "retenção_dias",
            "retencao",
            "retenção",
            "dias_retencao",
            "dias_retenção",
            "limite_retencao",
            "limite_retenção"
        ]),
        support_asana: getString(groupScope, ["support_asana", "suporte_asana"]),
        support_whatsapp: getString(groupScope, ["support_whatsapp", "suporte_whatsapp"]),
        session_id: getString(groupScope, ["session_id", "plan_session_id", "input_session_id"])
    };
}

function parseLimit(value: string | undefined): number | null {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(String(value).replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.floor(parsed);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value === null || value === "") return fallback;
    const normalized = normalizeText(value);
    if (["true", "1", "sim", "yes", "ativo", "habilitado"].includes(normalized)) return true;
    if (["false", "0", "nao", "não", "no", "inativo", "desabilitado"].includes(normalized)) return false;
    return fallback;
}

function resolveAssignmentPlan(basePlan: PlanDefinition, data: PlanAssignmentData, customOverrideSelected = false): { plan?: PlanDefinition; error?: string } {
    const alertLimit = parseLimit(data.custom_alert_limit);
    const reportLimit = parseLimit(data.custom_report_limit);
    const deviceLimit = parseLimit(data.custom_device_limit);
    const retentionDays = parseLimit(data.custom_retention_days);
    const hasCustomAlertLimit = data.custom_alert_limit !== undefined;
    const hasCustomReportLimit = data.custom_report_limit !== undefined;
    const hasCustomDeviceLimit = data.custom_device_limit !== undefined;
    const hasCustomRetentionDays = data.custom_retention_days !== undefined;

    if (hasCustomAlertLimit && alertLimit === null) {
        return { error: "Informe um limite válido de alertas personalizados." };
    }

    if (hasCustomReportLimit && reportLimit === null) {
        return { error: "Informe um limite válido de relatórios personalizados." };
    }

    if (hasCustomDeviceLimit && deviceLimit === null) {
        return { error: "Informe um limite válido de sensores personalizados." };
    }

    if (hasCustomRetentionDays && (!retentionDays || retentionDays <= 0)) {
        return { error: "Informe uma retenção válida em dias para usar no plano." };
    }

    if (customOverrideSelected && !hasCustomAlertLimit) {
        return { error: "Informe o limite personalizado de alertas para usar o plano Custom." };
    }

    if (customOverrideSelected && !hasCustomReportLimit) {
        return { error: "Informe o limite personalizado de relatórios para usar o plano Custom." };
    }

    const hasCustomLimits = hasCustomAlertLimit || hasCustomReportLimit || hasCustomDeviceLimit || hasCustomRetentionDays;
    const resolvedAlertLimit = alertLimit ?? basePlan.alertLimit;
    const resolvedReportLimit = reportLimit ?? basePlan.reportLimit;
    const resolvedDeviceLimit = deviceLimit ?? basePlan.deviceLimit;
    const resolvedRetentionDays = retentionDays ?? basePlan.retentionDays;
    const description = hasCustomLimits
        ? `${basePlan.description} Limites personalizados aplicados: ${resolvedAlertLimit} alertas, ${resolvedReportLimit} relatórios e retenção de ${resolvedRetentionDays} dias.`
        : basePlan.description;

    return {
        plan: {
            ...basePlan,
            deviceLimit: resolvedDeviceLimit,
            alertLimit: resolvedAlertLimit,
            reportLimit: resolvedReportLimit,
            retentionDays: resolvedRetentionDays,
            supportAsana: parseBoolean(data.support_asana, basePlan.supportAsana),
            supportWhatsapp: parseBoolean(data.support_whatsapp, basePlan.supportWhatsapp),
            description
        }
    };
}

async function findOrganizationDevice(resources: any, data: PlanAssignmentData): Promise<any | null> {
    const candidates = Array.from(new Set([
        data.organization_device,
        data.organization
    ].filter(Boolean))) as string[];

    for (const candidate of candidates) {
        try {
            return await resources.devices.info(candidate);
        } catch (_) {
            // O valor pode ser nome/tag em vez de ID de device.
        }
    }

    const wanted = [
        data.organization,
        data.organization_name,
        data.organization_device
    ].filter(Boolean).map((item) => normalizeText(item));

    if (!wanted.length) return null;

    let page = 1;
    while (true) {
        const devices = await resources.devices.list({
            page,
            amount: 100,
            fields: ["id", "name", "tags"]
        });

        const found = devices.find((device: any) => {
            const values = [
                device.id,
                device.name,
                getTagValue(device.tags, "organization_id"),
                getTagValue(device.tags, "organization_name"),
                getTagValue(device.tags, "org_id"),
                getTagValue(device.tags, "company_id"),
                getTagValue(device.tags, "company"),
                getTagValue(device.tags, "group_id")
            ].filter(Boolean).map((item) => normalizeText(item));

            return values.some((value) => wanted.includes(value));
        });

        if (found) return await resources.devices.info(found.id);
        if (devices.length < 100) break;
        page += 1;
    }

    return null;
}

async function listRunUsers(resources: any): Promise<any[]> {
    const users: any[] = [];
    let page = 1;

    while (true) {
        const result = await resources.run.listUsers({
            page,
            amount: 100,
            fields: ["id", "name", "email", "company", "tags", "active"]
        });

        users.push(...result);
        if (result.length < 100) break;
        page += 1;
    }

    return users;
}

function userBelongsToOrganization(user: any, organization: OrganizationRef): boolean {
    const wanted = [
        organization.id,
        organization.name,
        organization.deviceId,
        ...(organization.aliases || [])
    ].filter(Boolean).map((item) => normalizeText(item));

    if (!wanted.length) return false;

    const userValues = [
        user.company,
        getTagValue(user.tags, "user_org_id"),
        getTagValue(user.tags, "user_org_id_label"),
        getTagValue(user.tags, "organization_id"),
        getTagValue(user.tags, "organization_name"),
        getTagValue(user.tags, "organization_device"),
        getTagValue(user.tags, "org_id"),
        getTagValue(user.tags, "company_id"),
        getTagValue(user.tags, "company"),
        getTagValue(user.tags, "group_id")
    ].filter(Boolean).map((item) => normalizeText(item));

    return userValues.some((value) => wanted.includes(value));
}

function deviceBelongsToOrganization(device: any, organization: OrganizationRef): boolean {
    const wanted = [
        organization.id,
        organization.name,
        organization.deviceId,
        ...(organization.aliases || [])
    ].filter(Boolean).map((item) => normalizeText(item));

    if (!wanted.length) return false;

    const deviceValues = [
        device.id,
        device.name,
        getTagValue(device.tags, "organization_id"),
        getTagValue(device.tags, "organization_name"),
        getTagValue(device.tags, "organization_device"),
        getTagValue(device.tags, "user_org_id"),
        getTagValue(device.tags, "user_org_id_label"),
        getTagValue(device.tags, "org_id"),
        getTagValue(device.tags, "company_id"),
        getTagValue(device.tags, "company"),
        getTagValue(device.tags, "group_id")
    ].filter(Boolean).map((item) => normalizeText(item));

    return deviceValues.some((value) => wanted.includes(value));
}

async function listOrganizationDevices(resources: any, organization: OrganizationRef): Promise<any[]> {
    const devices: any[] = [];
    let page = 1;

    while (true) {
        const result = await resources.devices.list({
            page,
            amount: 100,
            fields: ["id", "name", "tags"]
        });

        devices.push(...result.filter((device: any) => deviceBelongsToOrganization(device, organization)));
        if (result.length < 100) break;
        page += 1;
    }

    return devices;
}

async function applyRetentionToOrganizationDevices(resources: any, organization: OrganizationRef, plan: PlanDefinition, planTags: any[]): Promise<number> {
    const devices = await listOrganizationDevices(resources, organization);
    const uniqueDevices = new Map(devices.map((device) => [device.id, device]));

    if (organization.deviceId && !uniqueDevices.has(organization.deviceId)) {
        try {
            const organizationDevice = await resources.devices.info(organization.deviceId);
            uniqueDevices.set(organizationDevice.id, organizationDevice);
        } catch (_) {
            // O device principal ja foi validado antes; se falhar aqui, seguimos com os demais.
        }
    }

    let updated = 0;

    for (const device of uniqueDevices.values()) {
        await resources.devices.edit(device.id, {
            chunk_retention: plan.retentionDays,
            tags: upsertTags(device.tags || [], planTags)
        });
        updated += 1;
    }

    return updated;
}

async function sendValidation(resources: any, deviceId: string, message: string, type: "success" | "danger", sessionId?: string) {
    await resources.devices.sendDeviceData(deviceId, {
        variable: "validation",
        value: message,
        metadata: {
            type,
            show_markdown: true,
            ...(sessionId ? { session_id: sessionId } : {})
        }
    });
}

async function manageOrganizationPlan(context: any, scope: any[]) {
    context.log("Running Analysis - Managing Organization Plan");

    if (!scope || scope.length === 0) {
        return context.log("No data in scope");
    }

    const token = context.token;
    const resources = new Resources({ token });
    const inputDeviceId = scope[0].device;
    const data = extractPlanAssignment(scope);
    context.log(`Plan assignment extracted: ${JSON.stringify(data)}`);

    const customOverrideSelected = normalizeText(data.plan) === "custom";
    const selectedPlanValue = customOverrideSelected ? data.base_plan : data.plan;
    const basePlan = getPlanDefinition(selectedPlanValue);

    if (!basePlan) {
        const availablePlans = Object.values(PLAN_DEFINITIONS).map((item) => item.label).join(", ");
        const customMessage = customOverrideSelected
            ? "Plano base inválido. Quando usar Custom, selecione o plano base: Essencial, Avançado ou Premium."
            : `Plano inválido. Selecione um destes planos: ${availablePlans}.`;
        await sendValidation(resources, inputDeviceId, customMessage, "danger", data.session_id);
        return context.log(`Invalid plan selected: plan=${data.plan} base_plan=${data.base_plan}`);
    }

    const resolvedPlan = resolveAssignmentPlan(basePlan, data, customOverrideSelected);

    if (!resolvedPlan.plan) {
        await sendValidation(resources, inputDeviceId, resolvedPlan.error || "Configuração inválida para o plano selecionado.", "danger", data.session_id);
        return context.log(`Invalid plan configuration. data=${JSON.stringify(data)} error=${resolvedPlan.error}`);
    }

    const plan = resolvedPlan.plan;
    context.log(`Resolved plan limits: plan=${plan.id} alerts=${plan.alertLimit} reports=${plan.reportLimit} devices=${plan.deviceLimit} retention=${plan.retentionDays}d`);
    const organizationDevice = await findOrganizationDevice(resources, data);

    if (!organizationDevice) {
        await sendValidation(resources, inputDeviceId, "Organização não encontrada. Verifique o ID, nome ou device da organização selecionada.", "danger", data.session_id);
        return context.log(`Organization not found. data=${JSON.stringify(data)}`);
    }

    const organization = {
        id: organizationDevice.id,
        name: data.organization_name || getTagValue(organizationDevice.tags, "organization_name") || organizationDevice.name,
        deviceId: organizationDevice.id,
        aliases: [
            data.organization,
            data.organization_device,
            getTagValue(organizationDevice.tags, "organization_id"),
            getTagValue(organizationDevice.tags, "organization_device"),
            getTagValue(organizationDevice.tags, "org_id"),
            getTagValue(organizationDevice.tags, "company_id"),
            getTagValue(organizationDevice.tags, "group_id")
        ]
    };
    const planTags = buildPlanTags(plan, organization);

    await resources.devices.edit(organizationDevice.id, {
        chunk_retention: plan.retentionDays,
        tags: upsertTags(organizationDevice.tags || [], planTags)
    });

    const devicesUpdated = await applyRetentionToOrganizationDevices(resources, organization, plan, planTags);

    const users = await listRunUsers(resources);
    const organizationUsers = users.filter((user) => userBelongsToOrganization(user, organization));

    for (const user of organizationUsers) {
        await resources.run.userEdit(user.id, {
            tags: upsertTags(user.tags || [], planTags)
        });
    }

    const status = await publishPlanStatus(resources, organizationDevice.id, plan);

    await resources.devices.sendDeviceData(organizationDevice.id, {
        variable: "plano_atual",
        value: plan.id,
        metadata: {
            label: plan.label,
            description: plan.description,
            device_limit: plan.deviceLimit,
            alert_limit: plan.alertLimit,
            report_limit: plan.reportLimit,
            retention_days: plan.retentionDays,
            support_asana: plan.supportAsana,
            support_whatsapp: plan.supportWhatsapp,
            users_updated: organizationUsers.length,
            devices_updated: devicesUpdated,
            updated_at: new Date().toISOString()
        }
    });

    await sendValidation(
        resources,
        inputDeviceId,
        `Plano ${plan.label} aplicado para ${organization.name}. Limites aplicados: ${plan.alertLimit} alertas, ${plan.reportLimit} relatórios e retenção de ${plan.retentionDays} dias. Devices atualizados: ${devicesUpdated}. Usuários atualizados: ${organizationUsers.length}. Alertas restantes: ${status.remaining.alerts}. Relatórios restantes: ${status.remaining.reports}.`,
        "success",
        data.session_id
    );

    context.log(`Plan ${plan.id} applied to organization ${organizationDevice.id}. users=${organizationUsers.length} devices=${devicesUpdated} retention=${plan.retentionDays}d`);
}

export { manageOrganizationPlan };
export default new Analysis(manageOrganizationPlan, { token: "a-4eb12d26-5c2a-4b50-8a31-0f9371c8144e" });
