import { Analysis, Resources } from "@tago-io/sdk";
import { deleteDeviceDataByVariables, getMonthlyUsagePeriodStart, getPlanFromTags, publishPlanStatus } from "./planLimits";

async function listOrganizationDevicesWithPlan(resources: any): Promise<any[]> {
    const devices: any[] = [];
    let page = 1;

    while (true) {
        const pageDevices = await resources.devices.list({
            page,
            amount: 100,
            fields: ["id", "name", "tags"]
        });

        devices.push(...pageDevices.filter((device: any) => getPlanFromTags(device.tags || [])));
        if (pageDevices.length < 100) break;
        page += 1;
    }

    return devices;
}

async function resetMonthlyPlanUsage(context: any) {
    context.log("Running Analysis - Reset Monthly Plan Usage");

    const resources = new Resources({ token: context.token });
    const organizationDevices = await listOrganizationDevicesWithPlan(resources);
    const resetAt = new Date().toISOString();
    const billingPeriodStart = getMonthlyUsagePeriodStart().toISOString();
    let updated = 0;

    for (const device of organizationDevices) {
        const plan = getPlanFromTags(device.tags || []);
        if (!plan) continue;

        const deletedReports = await deleteDeviceDataByVariables(resources, device.id, ["relatorios"]).catch(() => 0);
        const deletedPlanEvents = await deleteDeviceDataByVariables(resources, device.id, [
            "plano_sincronizado",
            "plano_reset_mensal",
            "validation"
        ]).catch(() => 0);
        const deletedAlertUsage = await deleteDeviceDataByVariables(
            resources,
            device.id,
            ["alertas"],
            (item: any) => Boolean(item?.metadata?.organization_usage_record)
        ).catch(() => 0);

        await resources.devices.sendDeviceData(device.id, {
            variable: "plano_reset_mensal",
            value: "reset",
            metadata: {
                plan_id: plan.id,
                plan_name: plan.label,
                billing_period_start: billingPeriodStart,
                reset_at: resetAt
            }
        });

        await publishPlanStatus(resources, device.id, plan, {
            alerts: 0,
            reports: 0
        });

        updated += 1;
        context.log(`Monthly usage reset published for organization=${device.id} plan=${plan.id} deleted_reports=${deletedReports} deleted_plan_events=${deletedPlanEvents} deleted_alert_usage=${deletedAlertUsage}`);
    }

    context.log(`Monthly plan usage reset finished. organizations_updated=${updated}`);
}

export { resetMonthlyPlanUsage };
export default new Analysis(resetMonthlyPlanUsage, { token: "a-4eb12d26-5c2a-4b50-8a31-0f9371c8144e" });
