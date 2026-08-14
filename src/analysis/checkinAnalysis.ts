import { Analysis, Resources } from "@tago-io/sdk";
import { sendRunNotification } from "./notificationUtils";

interface CheckinAlertMetadata {
    alert_uid?: string;
    alert_variable?: string;
    alert_type: string;
    checkin_time: number;
    device_id?: string;
    send_to?: string;
    email_enabled?: boolean;
    created_at?: string;
    description?: string;
    lock?: boolean;
    last_notified_at?: string;
    last_notified_last_input?: string;
    last_recovered_at?: string;
    last_recovered_last_input?: string;
}

interface AlertBundle {
    group: string;
    records: any[];
    metadata: CheckinAlertMetadata;
    value: any;
    locked: boolean;
}

interface CommunicationStatus {
    lastCommunication?: Date;
    hoursOffline: number;
    isOffline: boolean;
    source: string;
}

function normalizeText(value: any): string {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function getTagValue(tags: any[] | undefined, key: string): string | undefined {
    const tag = (tags || []).find((item) => normalizeText(item?.key) === normalizeText(key));
    if (tag?.value === undefined || tag?.value === null || tag?.value === "") return undefined;
    return String(tag.value);
}

function isGroupDevice(device: any): boolean {
    return normalizeText(getTagValue(device.tags, "device_type")) === "group";
}

async function listAllDevices(resources: any): Promise<any[]> {
    const devices: any[] = [];
    let page = 1;

    while (true) {
        const result = await resources.devices.list({
            page,
            amount: 100,
            fields: ["id", "name", "tags"]
        });

        devices.push(...result);
        if (!result.length || result.length < 100) break;
        page += 1;
    }

    return devices;
}

function groupCheckinAlerts(alerts: any[]): AlertBundle[] {
    const bundles = new Map<string, any[]>();

    for (const alert of alerts) {
        const metadata = alert.metadata as CheckinAlertMetadata;
        if (!metadata || !["checkin", "checkin_central"].includes(metadata.alert_type) || alert.value !== "enabled") continue;

        const group = String(alert.group || alert.id);
        const current = bundles.get(group) || [];
        current.push(alert);
        bundles.set(group, current);
    }

    return Array.from(bundles.entries()).map(([group, records]) => {
        const preferred = records.find((record) => (record.metadata as CheckinAlertMetadata)?.lock === true) || records[0];
        const metadata = { ...(preferred.metadata || {}) } as CheckinAlertMetadata;
        const locked = records.some((record) => (record.metadata as CheckinAlertMetadata)?.lock === true);
        metadata.lock = locked;

        return {
            group,
            records,
            metadata,
            value: preferred.value,
            locked
        };
    });
}

function parseLastInput(deviceInfo: any): Date | undefined {
    const raw = deviceInfo?.last_input || deviceInfo?.lastInput || deviceInfo?.last_input_at || deviceInfo?.lastInputAt;
    if (!raw) return undefined;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

async function getCommunicationStatus(resources: any, deviceId: string, checkinTimeHours: number): Promise<CommunicationStatus> {
    const now = new Date();
    const lastPayload = await resources.devices.getDeviceData(deviceId, {
        variables: ["payload"],
        qty: 1,
        ordination: "descending"
    }).catch(() => []);

    if (!lastPayload?.length) {
        return {
            lastCommunication: undefined,
            hoursOffline: Number.POSITIVE_INFINITY,
            isOffline: true,
            source: "payload_not_found"
        };
    }

    const lastCommunication = new Date(lastPayload[0].time);

    if (Number.isNaN(lastCommunication.getTime())) {
        return {
            lastCommunication: undefined,
            hoursOffline: Number.POSITIVE_INFINITY,
            isOffline: true,
            source: "payload_invalid_time"
        };
    }

    const hoursOffline = (now.getTime() - lastCommunication.getTime()) / (1000 * 60 * 60);

    return {
        lastCommunication,
        hoursOffline,
        isOffline: hoursOffline >= checkinTimeHours,
        source: "payload"
    };
}

async function deleteAlertRecords(resources: any, containerDeviceId: string, ids: string[]): Promise<void> {
    for (let index = 0; index < ids.length; index += 100) {
        const batch = ids.slice(index, index + 100);
        await resources.devices.deleteDeviceData(containerDeviceId, { ids: batch });
    }
}

async function updateAlertLock(resources: any, containerDeviceId: string, bundle: AlertBundle, lock: boolean, extraMetadata: any, context: any): Promise<void> {
    const ids = bundle.records.map((record) => record.id).filter(Boolean).map(String);
    await deleteAlertRecords(resources, containerDeviceId, ids);

    await resources.devices.sendDeviceData(containerDeviceId, {
        variable: "alertas",
        value: bundle.value,
        group: bundle.group,
        metadata: {
            ...bundle.metadata,
            ...extraMetadata,
            lock
        }
    });

    context.log(`Checkin lock ${lock ? "activated" : "reset"} for alert_group=${bundle.group} records_replaced=${ids.length}`);
}

function resolveCentralTarget(bundle: AlertBundle, groupDevice: any, groupDevicesById: Map<string, any>, context: any): any | null {
    const targetId = bundle.metadata.device_id || groupDevice.id;
    const target = groupDevicesById.get(targetId);

    if (!target) {
        context.log(`Checkin alert_group=${bundle.group} target=${targetId} is not a device_type=group central. Skipping.`);
        return null;
    }

    return target;
}

async function processCentralCheckinAlert(resources: any, containerGroup: any, targetCentral: any, bundle: AlertBundle, context: any): Promise<void> {
    const metadata = bundle.metadata;
    const checkinTimeHours = Number(metadata.checkin_time || 0);

    if (!checkinTimeHours || checkinTimeHours <= 0) {
        context.log(`Invalid checkin_time for alert_group=${bundle.group}. value=${metadata.checkin_time}`);
        return;
    }

    const status = await getCommunicationStatus(resources, targetCentral.id, checkinTimeHours);
    const lastInputLabel = status.lastCommunication ? status.lastCommunication.toISOString() : "never";
    const hoursLabel = Number.isFinite(status.hoursOffline) ? status.hoursOffline.toFixed(2) : "never";

    context.log(`Central checkin target=${targetCentral.id}:${targetCentral.name} container=${containerGroup.id}:${containerGroup.name} alert_group=${bundle.group} last=${lastInputLabel} source=${status.source} offline_hours=${hoursLabel} limit=${checkinTimeHours} locked=${bundle.locked}`);

    if (status.isOffline) {
        if (bundle.locked) {
            context.log(`Central checkin already notified for alert_group=${bundle.group}; skipping until central communicates again.`);
            return;
        }

        if (metadata.send_to) {
            const hoursText = Number.isFinite(status.hoursOffline) ? status.hoursOffline.toFixed(1) : "sem historico";
            await sendRunNotification(
                resources,
                metadata.send_to,
                "Alerta: Central Sem Comunicacao",
                `A central ${targetCentral.name || targetCentral.id} esta sem comunicar ha ${hoursText} horas (limite: ${checkinTimeHours}h).`,
                context
            ).catch((error) => context.log(`Error sending central checkin notification: ${error}`));
        }

        await resources.devices.sendDeviceData(containerGroup.id, {
            variable: "alert_triggered",
            value: "Comunicacao da Central",
            metadata: {
                alert_type: "checkin_central",
                alert_variable: "checkin",
                alert_variable_label: "Comunicacao da Central",
                device_id: targetCentral.id,
                device_name: targetCentral.name || targetCentral.id,
                hours_offline: Number.isFinite(status.hoursOffline) ? status.hoursOffline : null,
                checkin_time: checkinTimeHours,
                last_input: status.lastCommunication?.toISOString() || null,
                timestamp: new Date().toISOString()
            }
        });

        await updateAlertLock(
            resources,
            containerGroup.id,
            bundle,
            true,
            {
                last_notified_at: new Date().toISOString(),
                last_notified_last_input: status.lastCommunication?.toISOString() || "never"
            },
            context
        );

        return;
    }

    if (bundle.locked) {
        await updateAlertLock(
            resources,
            containerGroup.id,
            bundle,
            false,
            {
                last_recovered_at: new Date().toISOString(),
                last_recovered_last_input: status.lastCommunication?.toISOString() || null
            },
            context
        );
    }
}

async function checkinAnalysis(context: any, scope: any[]) {
    context.log("Starting Checkin Analysis - Checking central communication");

    const resources = new Resources({ token: context.token });

    try {
        const allDevices = await listAllDevices(resources);
        const groupDevices = allDevices.filter(isGroupDevice);
        const groupDevicesById = new Map(groupDevices.map((device) => [device.id, device]));
        context.log(`Found ${groupDevices.length} device_type=group central(s) to check`);

        for (const groupDevice of groupDevices) {
            const alertsData = await resources.devices.getDeviceData(groupDevice.id, {
                variables: ["alertas"],
                qty: 9999
            }).catch(() => []);

            const checkinBundles = groupCheckinAlerts(alertsData || []);
            context.log(`Central container ${groupDevice.id}:${groupDevice.name} has ${checkinBundles.length} central checkin alert group(s)`);

            for (const bundle of checkinBundles) {
                const targetCentral = resolveCentralTarget(bundle, groupDevice, groupDevicesById, context);
                if (!targetCentral) continue;
                await processCentralCheckinAlert(resources, groupDevice, targetCentral, bundle, context);
            }
        }

        context.log("Checkin analysis completed");
    } catch (error) {
        context.log(`Error in checkin analysis: ${error}`);
    }
}

export { checkinAnalysis };
export default new Analysis(checkinAnalysis, { token: "a-bae808ee-4460-4042-a1e7-8e9f27ff2624" });