import { Analysis, Resources } from "@tago-io/sdk";
import {
    deleteDeviceDataByVariables,
    getPlanDefinition,
    getOrganizationAlertSourceDeviceIds,
    getPlanFromTags,
    getTagValue,
    publishPlanStatus,
    resolveOrganizationDeviceId
} from "./planLimits";

interface SyncPlanData {
    organization_device?: string;
    organization?: string;
    plan?: string;
    session_id?: string;
}

function getString(scope: any[], names: string[]): string | undefined {
    const item = scope.find((x) => names.includes(x.variable));
    if (item?.value === undefined || item?.value === null || item?.value === "") return undefined;
    return String(item.value).trim();
}

function extractSyncPlanData(scope: any[]): SyncPlanData {
    const group = scope[0]?.group;
    const groupScope = group ? scope.filter((item) => item.group === group) : scope;

    return {
        organization_device: getString(groupScope, ["organization_device", "org_device", "device_organization"]),
        organization: getString(groupScope, ["organization", "organization_id", "org", "org_id"]),
        plan: getString(groupScope, ["plan", "plano", "plan_id", "plano_id"]),
        session_id: getString(groupScope, ["session_id", "sync_session_id", "input_session_id"])
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(error: any, attempt: number): number {
    const text = String(error?.message || error || "");
    const retryAfterMatch = text.match(/Retry-After:\s*(\d+)/i);
    const retryAfterSeconds = retryAfterMatch ? Number(retryAfterMatch[1]) : 0;
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return retryAfterSeconds * 1000 + 500;
    return Math.min(30000, 1000 * Math.pow(2, attempt));
}

function isRateLimitError(error: any): boolean {
    const text = String(error?.message || error || "").toLowerCase();
    return text.includes("too many requests") || text.includes("retry-after") || error?.status === 429 || error?.statusCode === 429;
}

async function withRateLimitRetry<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (!isRateLimitError(error) || attempt === attempts - 1) throw error;
            await sleep(getRetryDelayMs(error, attempt));
        }
    }

    throw lastError;
}
function normalizeValue(value: any): string {
    if (value === undefined || value === null) return "";
    return String(value).trim().toLowerCase();
}

function getAlertSignature(item: any): string {
    const metadata = item?.metadata || {};
    return [
        normalizeValue(metadata.alert_type),
        normalizeValue(metadata.alert_variable),
        normalizeValue(metadata.device_id),
        normalizeValue(metadata.condition),
        normalizeValue(metadata.threshold_value),
        normalizeValue(metadata.checkin_time),
        normalizeValue(item?.value)
    ].join("|");
}

async function deleteDeviceDataIds(resources: any, deviceId: string, ids: string[]): Promise<number> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    let deleted = 0;

    for (let index = 0; index < uniqueIds.length; index += 100) {
        const batch = uniqueIds.slice(index, index + 100);
        if (!batch.length) continue;

        await withRateLimitRetry(() => resources.devices.deleteDeviceData(deviceId, { ids: batch }));
        deleted += batch.length;
    }

    return deleted;
}

async function pruneOrganizationAlertUsageRecords(resources: any, organizationDeviceId: string, context: any): Promise<number> {
    const organizationAlerts = await withRateLimitRetry<any[]>(() => resources.devices.getDeviceData(organizationDeviceId, {
        variables: ["alertas"],
        qty: 9999
    })).catch(() => []);

    const usageRecords = (organizationAlerts || []).filter((item: any) => Boolean(item?.metadata?.organization_usage_record));
    if (!usageRecords.length) return 0;

    const sourceDeviceIds = await getOrganizationAlertSourceDeviceIds(resources, organizationDeviceId);
    const sourceAlertGroups: any[] = [];
    for (const deviceId of sourceDeviceIds) {
        const alerts = await withRateLimitRetry<any[]>(() =>
            resources.devices.getDeviceData(deviceId, { variables: ["alertas"], qty: 9999 })
        ).catch(() => []);
        sourceAlertGroups.push(alerts || []);
    }

    const activeSourceAlerts = sourceAlertGroups.flat().filter((item: any) => {
        if (item?.metadata?.organization_usage_record) return false;
        if (["disabled", "deleted", "removed"].includes(normalizeValue(item?.value))) return false;
        if (item?.metadata?.deleted || item?.metadata?.disabled) return false;
        return true;
    });

    const activeUids = new Set(activeSourceAlerts.map((item: any) => item?.metadata?.alert_uid).filter(Boolean).map(String));
    const activeSignatures = new Set(activeSourceAlerts.map(getAlertSignature));

    const staleIds = usageRecords
        .filter((item: any) => {
            const uid = item?.metadata?.alert_uid;
            if (uid) return !activeUids.has(String(uid));
            return !activeSignatures.has(getAlertSignature(item));
        })
        .map((item: any) => item?.id)
        .filter(Boolean)
        .map(String);

    const deleted = await deleteDeviceDataIds(resources, organizationDeviceId, staleIds);
    if (deleted) context.log(`Removed ${deleted} stale alert usage record(s) from organization ${organizationDeviceId}`);
    return deleted;
}
async function sendValidation(resources: any, deviceId: string, message: string, type: "success" | "danger", sessionId?: string) {
    await withRateLimitRetry(() => resources.devices.sendDeviceData(deviceId, {
        variable: "validation",
        value: message,
        metadata: {
            type,
            show_markdown: true,
            ...(sessionId ? { session_id: sessionId } : {})
        }
    }));
}

async function syncOrganizationPlanUsageCore(context: any, scope: any[]) {
    context.log("Running Analysis - Sync Organization Plan Usage");

    if (!scope || scope.length === 0) {
        return context.log("No data in scope");
    }

    const token = context.token;
    const resources = new Resources({ token });
    const inputDeviceId = scope[0].device;
    const data = extractSyncPlanData(scope);
    const organizationDeviceId = await resolveOrganizationDeviceId(resources, {
        explicitCandidates: [
            data.organization_device,
            data.organization
        ],
        groupDeviceId: inputDeviceId,
        fallbackDeviceId: inputDeviceId
    });

    const organizationDevice = await withRateLimitRetry(() => resources.devices.info(organizationDeviceId));
    const plan = getPlanFromTags(organizationDevice.tags || []) || getPlanDefinition(data.plan);

    if (!plan) {
        await sendValidation(resources, inputDeviceId, "Não foi possível sincronizar: plano não encontrado no device da organização.", "danger", data.session_id);
        return context.log(`No plan found for organization device ${organizationDeviceId}`);
    }

    const deletedStaleAlertUsage = await pruneOrganizationAlertUsageRecords(resources, organizationDeviceId, context).catch((error) => {
        context.log(`Error pruning stale alert usage records: ${error}`);
        return 0;
    });

    await deleteDeviceDataByVariables(resources, organizationDeviceId, ["plano_sincronizado"]).catch(() => 0);
    await deleteDeviceDataByVariables(resources, inputDeviceId, ["validation"]).catch(() => 0);

    const status = await publishPlanStatus(resources, organizationDeviceId, plan);
    await withRateLimitRetry(() => resources.devices.sendDeviceData(organizationDeviceId, {
        variable: "plano_sincronizado",
        value: "ok",
        metadata: {
            plan_id: plan.id,
            alerts_used: status.usage.alerts,
            reports_used: status.usage.reports,
            alerts_remaining: status.remaining.alerts,
            reports_remaining: status.remaining.reports,
            deleted_stale_alert_usage: deletedStaleAlertUsage,
            organization_name: getTagValue(organizationDevice.tags, "organization_name") || organizationDevice.name,
            updated_at: new Date().toISOString()
        }
    }));

    await sendValidation(
        resources,
        inputDeviceId,
        `Uso do plano sincronizado. Alertas usados: ${status.usage.alerts}. Relatórios usados: ${status.usage.reports}.`,
        "success",
        data.session_id
    );

    context.log(`Plan usage synchronized for organization ${organizationDeviceId}: alerts=${status.usage.alerts} reports=${status.usage.reports} deleted_stale_alert_usage=${deletedStaleAlertUsage}`);
}

async function syncOrganizationPlanUsage(context: any, scope: any[]) {
    try {
        await syncOrganizationPlanUsageCore(context, scope);
    } catch (error) {
        const message = String((error as any)?.message || error || "Erro desconhecido");
        context.log("Failed to sync organization plan usage: " + message);

        if (!scope || scope.length === 0) return;

        const resources = new Resources({ token: context.token });
        const inputDeviceId = scope[0].device;
        const data = extractSyncPlanData(scope);
        await sendValidation(resources, inputDeviceId, "N�o foi poss�vel sincronizar o uso do plano agora. Tente novamente em alguns instantes. Detalhe: " + message, "danger", data.session_id).catch((validationError) => {
            context.log("Failed to send sync validation: " + validationError);
        });
    }
}

export { syncOrganizationPlanUsage };
export default new Analysis(syncOrganizationPlanUsage, { token: "a-7f64dc61-7e6f-4f99-9d22-2f285d9e38bc" });
