import { Analysis, Resources } from "@tago-io/sdk";
import {
    deleteDeviceDataByVariables,
    getPlanDefinition,
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

async function syncOrganizationPlanUsage(context: any, scope: any[]) {
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

    const organizationDevice = await resources.devices.info(organizationDeviceId);
    const plan = getPlanFromTags(organizationDevice.tags || []) || getPlanDefinition(data.plan);

    if (!plan) {
        await sendValidation(resources, inputDeviceId, "Não foi possível sincronizar: plano não encontrado no device da organização.", "danger", data.session_id);
        return context.log(`No plan found for organization device ${organizationDeviceId}`);
    }

    await deleteDeviceDataByVariables(resources, organizationDeviceId, ["plano_sincronizado"]).catch(() => 0);
    await deleteDeviceDataByVariables(resources, inputDeviceId, ["validation"]).catch(() => 0);

    const status = await publishPlanStatus(resources, organizationDeviceId, plan);
    await resources.devices.sendDeviceData(organizationDeviceId, {
        variable: "plano_sincronizado",
        value: "ok",
        metadata: {
            plan_id: plan.id,
            alerts_used: status.usage.alerts,
            reports_used: status.usage.reports,
            alerts_remaining: status.remaining.alerts,
            reports_remaining: status.remaining.reports,
            organization_name: getTagValue(organizationDevice.tags, "organization_name") || organizationDevice.name,
            updated_at: new Date().toISOString()
        }
    });

    await sendValidation(
        resources,
        inputDeviceId,
        `Uso do plano sincronizado. Alertas usados: ${status.usage.alerts}. Relatórios usados: ${status.usage.reports}.`,
        "success",
        data.session_id
    );

    context.log(`Plan usage synchronized for organization ${organizationDeviceId}: alerts=${status.usage.alerts} reports=${status.usage.reports}`);
}

export { syncOrganizationPlanUsage };
export default new Analysis(syncOrganizationPlanUsage, { token: "a-7f64dc61-7e6f-4f99-9d22-2f285d9e38bc" });
