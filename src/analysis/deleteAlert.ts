import { Analysis, Resources } from "@tago-io/sdk";
import {
    getPlanFromTags,
    getTagValue,
    publishPlanStatus,
    resolveOrganizationDeviceId
} from "./planLimits";

interface DeleteAlertData {
    alert_id?: string;
    alert_group?: string;
    alert_signature?: string;
    alert_device_id?: string;
    organization_device?: string;
    org_device?: string;
    organization?: string;
    session_id?: string;
}

function getString(scope: any[], names: string[]): string | undefined {
    const item = scope.find((x) => names.includes(x.variable));
    if (item?.value === undefined || item?.value === null || item?.value === "") return undefined;
    return String(item.value).trim();
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
        normalizeValue(metadata.send_to),
        normalizeValue(metadata.created_at),
        normalizeValue(metadata.description),
        normalizeValue(item?.value)
    ].join("|");
}

function extractDeleteAlertData(scope: any[]): DeleteAlertData {
    const group = scope[0]?.group;
    const groupScope = group ? scope.filter((item) => item.group === group) : scope;
    const alertItem = groupScope.find((item) => item.variable === "alertas") || scope.find((item) => item.variable === "alertas") || scope[0];

    return {
        alert_id: getString(groupScope, ["alert_id", "alert_data_id", "data_id"]) || (alertItem?.id ? String(alertItem.id) : undefined),
        alert_group: group ? String(group) : (alertItem?.group ? String(alertItem.group) : undefined),
        alert_signature: alertItem ? getAlertSignature(alertItem) : undefined,
        alert_device_id: getString(groupScope, ["alert_device_id", "source_device", "source_group_device", "group_device", "group_dev"]) || (alertItem?.device ? String(alertItem.device) : undefined),
        organization_device: getString(groupScope, ["organization_device", "device_organization"]),
        org_device: getString(groupScope, ["org_device"]),
        organization: getString(groupScope, ["organization", "organization_id", "org", "org_id"]),
        session_id: getString(groupScope, ["session_id", "delete_session_id", "input_session_id"])
    };
}

async function getAllAlertRecords(resources: any, deviceId: string): Promise<any[]> {
    const records: any[] = [];
    const qty = 1000;
    let skip = 0;

    while (skip < 50000) {
        const batch = await resources.devices.getDeviceData(deviceId, {
            variables: ["alertas"],
            qty,
            skip,
            ordination: "descending"
        }).catch(() => []);

        records.push(...(batch || []));
        if (!batch || batch.length < qty) break;
        skip += qty;
    }

    return records;
}
async function getAlertRecordsByGroup(resources: any, deviceId: string, group: string): Promise<any[]> {
    return resources.devices.getDeviceData(deviceId, {
        variables: ["alertas"],
        groups: group,
        qty: 1000,
        ordination: "descending"
    } as any).catch(() => []);
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

async function deleteAlert(context: any, scope: any[]) {
    context.log("Running Analysis - Delete Alert");
    console.log("Delete Alert scope:", scope);
    console.log("Delete Alert scope JSON:", JSON.stringify(scope, null, 2));

    if (!scope || scope.length === 0) {
        return context.log("No data in scope");
    }

    const resources = new Resources({ token: context.token });
    const inputDeviceId = scope[0].device;
    const data = extractDeleteAlertData(scope);
    const targetDeviceId = data.alert_device_id || inputDeviceId;

    if (!data.alert_id || !targetDeviceId) {
        await sendValidation(resources, inputDeviceId, "Não foi possível excluir: a linha precisa enviar device e id do alerta.", "danger", data.session_id).catch(() => undefined);
        return context.log(`Delete ignored: missing target data alert_id=${data.alert_id} target_device=${targetDeviceId}`);
    }

    const targetAlerts = await getAllAlertRecords(resources, targetDeviceId);
    const idsToDelete = (targetAlerts || [])
        .filter((item: any) => {
            if (data.alert_group) return String(item?.group || "") === data.alert_group;
            if (data.alert_id && String(item?.id || "") === data.alert_id) return true;
            if (data.alert_signature && getAlertSignature(item) === data.alert_signature) return true;
            return false;
        })
        .map((item: any) => item?.id)
        .filter(Boolean)
        .map((id: any) => String(id));

    if (!idsToDelete.length && !data.alert_group) {
        await sendValidation(resources, inputDeviceId, "Nenhum registro equivalente do alerta foi encontrado para exclusão.", "danger", data.session_id).catch(() => undefined);
        return context.log(`Delete ignored: no matching alertas found for id=${data.alert_id} group=${data.alert_group} device=${targetDeviceId}`);
    }

    let deletedCount = 0;

    if (data.alert_group) {
        context.log(`Deleting alertas by group from device=${targetDeviceId} group=${data.alert_group}`);
        const result = await resources.devices.deleteDeviceData(targetDeviceId, {
            variables: ["alertas"],
            groups: data.alert_group,
            qty: 9999
        } as any);
        deletedCount = idsToDelete.length;
        context.log(`Delete alertas by group result: ${result}`);
    }

    const remainingAfterGroupDelete = data.alert_group
        ? await getAlertRecordsByGroup(resources, targetDeviceId, data.alert_group)
        : [];

    if (data.alert_group) {
        context.log(`Remaining alertas after group delete for device=${targetDeviceId} group=${data.alert_group}: ${remainingAfterGroupDelete.length}`);
    }

    const idsStillPresent = remainingAfterGroupDelete
        .map((item: any) => item?.id)
        .filter(Boolean)
        .map((id: any) => String(id));

    const fallbackIds = data.alert_group ? idsStillPresent : idsToDelete;

    context.log(`Deleting ${fallbackIds.length} alert data record(s) by id from device=${targetDeviceId}: ${fallbackIds.join(",")}`);
    for (let index = 0; index < fallbackIds.length; index += 100) {
        const batch = fallbackIds.slice(index, index + 100);
        await resources.devices.deleteDeviceData(targetDeviceId, { ids: batch });
    }
    deletedCount = Math.max(deletedCount, fallbackIds.length);

    const remainingAfterIdDelete = data.alert_group
        ? await getAlertRecordsByGroup(resources, targetDeviceId, data.alert_group)
        : [];

    if (data.alert_group) {
        context.log(`Remaining alertas after id fallback for device=${targetDeviceId} group=${data.alert_group}: ${remainingAfterIdDelete.length}`);
    }

    const organizationDeviceId = await resolveOrganizationDeviceId(resources, {
        explicitCandidates: [
            data.organization_device,
            data.org_device,
            data.organization
        ],
        groupDeviceId: targetDeviceId,
        fallbackDeviceId: targetDeviceId
    }).catch(() => undefined);

    let organizationName = organizationDeviceId || "não resolvida";
    if (organizationDeviceId) {
        const organizationDevice = await resources.devices.info(organizationDeviceId).catch(() => null);
        organizationName = organizationDevice ? getTagValue(organizationDevice.tags || [], "organization_name") || organizationDevice.name : organizationDeviceId;
        const plan = organizationDevice ? getPlanFromTags(organizationDevice.tags || []) : null;
        if (plan) {
            await publishPlanStatus(resources, organizationDeviceId, plan).catch((error) => {
                context.log(`Could not publish plan status after alert delete: ${error}`);
            });
        }
    }

    await sendValidation(resources, inputDeviceId, `Alerta removido com sucesso. Registros removidos: ${deletedCount}. Device: ${targetDeviceId}. Organização: ${organizationName}.`, "success", data.session_id).catch(() => undefined);
    context.log(`Alert deleted successfully. deleted=${deletedCount} alert_id=${data.alert_id} group=${data.alert_group} source_device=${targetDeviceId} organization=${organizationDeviceId || "not_resolved"}`);
}

export { deleteAlert };
export default new Analysis(deleteAlert);

