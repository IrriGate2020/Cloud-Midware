import { Analysis, Resources } from "@tago-io/sdk";
import { PlanDefinition, enforcePlanLimit, getOrganizationDeviceIdFromTags, getPlanFromTags, publishPlanStatus, resolveOrganizationDeviceId } from "./planLimits";

interface AlertData {
    alert_variable?: string;
    alert_condition?: string;
    alert_value?:   string | boolean | number;
    alert_device?: string;
    aler_email?: boolean;
    alert_send_to?: string;
    checkin_time?: number;  // Tempo em horas para alerta de checkin
    alert_session_id?: string;
}

// Mapeamento de variáveis para labels das centrais
const variableLabels: { [key: string]: string } = {
    'sboia': 'Status Boia - Caixa cheia (1), Caixa vazia(0)',
    'sboia1': 'Status Boia 1 - Caixa cheia (1), Caixa vazia(0)',
    'sboia2': 'Status Boia 2 - Caixa cheia (1), Caixa vazia(0)',
    'tempInt': 'Temperatura Interna',
    'checkin': 'Comunicação da Central',
    'ES000': 'Sensor OK',
    'ES001': 'Erro de CRC',
    'ES002': 'Leitura fora dos limites',
    'ES003': 'Sensor sem resposta',
    'ES004': 'Mudanca brusca na leitura',
    'ES005': 'Leitura acima do setpoint high',
    'ES006': 'Leitura abaixo do setpoint low',
    'EA000': 'Automacao OK',
    'EA001': 'Sem estimulo',
};

// Função para obter o label da variável
function getVariableLabel(variable: string): string {
    return variableLabels[variable] || variable;
}

function createAlertUid(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function createAlertCentral(context: any, scope: any[]) {
    console.log("Running Analysis - Creating Alert for Central");
    console.log(scope);

    if (!scope || scope.length === 0) {
        return context.log("No data in scope");
    }

    const token = context.token;
    const resources = new Resources({ token });

    // Extrair dados do scope baseado no grupo
    const group_id = scope[0].group;
    const device_id = scope[0].device;
    
    context.log(`Received scope - group_id: ${group_id}, device_id: ${device_id}`);

    if (!group_id) {
        return context.log("No group ID found in scope");
    }

    // Agrupar dados por variável
    const alertData: Partial<AlertData> = {};
    
    for (const item of scope) {
        if (item.group === group_id) {
            switch (item.variable) {
                case 'alert_variable':
                    alertData.alert_variable = item.value as string;
                    break;
                case 'alert_condition':
                    alertData.alert_condition = item.value as string;
                    break;
                case 'alert_value':
                    alertData.alert_value = item.value;
                    break;
                case 'alert_device':
                    alertData.alert_device = item.value as string;
                    break;
                case 'aler_email':
                    alertData.aler_email = item.value as boolean;
                    break;
                case 'alert_send_to':
                    alertData.alert_send_to = item.value as string;
                    break;
                case 'checkin_time':
                    alertData.checkin_time = Number(item.value);
                    break;
                case 'session_id':
                case 'alert_session_id':
                case 'input_session_id':
                    alertData.alert_session_id = String(item.value);
                    break;
            }
        }
    }

    context.log("Alert data extracted:", alertData);
    
    context.log(`Target device for alert: ${alertData.alert_device}`);

    // Verificar se é alerta de checkin
    const is_checkin_alert = alertData.alert_variable === 'checkin';

    // Validar dados obrigatórios
    if (is_checkin_alert) {
        // Para alerta de checkin, precisa de: alert_variable, alert_device, checkin_time
        if (!alertData.alert_variable || !alertData.alert_device || !alertData.checkin_time) {
            return context.log("Missing required fields for checkin alert");
        }
    } else {
        // Para alertas normais, precisa de: alert_variable, condition, value, device
        if (!alertData.alert_variable || !alertData.alert_condition || alertData.alert_value === undefined || !alertData.alert_device) {
            return context.log("Missing required alert fields");
        }
    }

    // Verificar se o usuário é admin para manter a descrição legível; o limite agora vem do plano da organização.
    let is_admin = false;
    let user_name = "";
    let user_plan: PlanDefinition | null = null;
    let user_organization_device_id: string | undefined;
    
    if (alertData.alert_send_to) {
        try {
            const user_info = await resources.run.userInfo(alertData.alert_send_to);
            const user_tags = user_info.tags || [];
            user_plan = getPlanFromTags(user_tags);
            user_organization_device_id = getOrganizationDeviceIdFromTags(user_tags);
            
            // Verificar se tem tag access: admin
            is_admin = user_tags.some((tag: any) => tag.key === 'access' && tag.value === 'admin');
            
            // Pegar nome do usuário
            user_name = user_info.name || alertData.alert_send_to;
            
            if (is_admin) {
                context.log("User is admin - organization plan limit still applies");
            }
        } catch (error) {
            context.log("Error checking user info:", error);
            user_name = alertData.alert_send_to;
        }
    }

    // Buscar informações do dispositivo central
    const device_info = await resources.devices.info(alertData.alert_device);
    const device_name = device_info.name || alertData.alert_device;
    const organization_device_id = await resolveOrganizationDeviceId(resources, {
        explicitCandidates: [
            user_organization_device_id,
            getOrganizationDeviceIdFromTags(device_info.tags || []),
            device_id !== alertData.alert_device ? device_id : undefined
        ],
        groupDeviceId: alertData.alert_device,
        fallbackDeviceId: alertData.alert_device
    });
    context.log(`Plan usage target organization device: ${organization_device_id}`);
    const planLimit = await enforcePlanLimit(resources, organization_device_id, "alerts", user_plan);
    context.log(`Plan limit check for central alerts: plan=${planLimit.plan?.id || "not_found"} used=${planLimit.status?.usage.alerts ?? "n/a"} limit=${planLimit.plan?.alertLimit ?? "n/a"}`);

    if (!planLimit.allowed) {
        context.log(planLimit.message);

        await resources.devices.sendDeviceData(device_id, {
            variable: "validation",
            value: planLimit.message || "Limite de alertas atingido para o plano da organização.",
            metadata: {
                type: "danger",
                show_markdown: true,
                ...(alertData.alert_session_id ? { session_id: alertData.alert_session_id } : {})
            }
        });

        if (alertData.alert_send_to) {
            try {
                await resources.run.notificationCreate(alertData.alert_send_to, {
                    title: "Limite de Alertas Atingido",
                    message: planLimit.message || "O limite de alertas do plano da organização foi atingido."
                });
            } catch (error) {
                context.log("Error sending limit notification:", error);
            }
        }

        return context.log("Cannot create alert: organization plan limit reached");
    }

    // Criar descrição legível do alerta
    let alert_description: string;
    
    if (is_checkin_alert) {
        alert_description = `Alerta de checkin criado para monitorar comunicação da central. Notificação será enviada se o dispositivo ficar ${alertData.checkin_time} horas sem comunicar${user_name ? ` e será enviado para o usuário ${user_name}` : ''}`;
    } else {
        // Mapear condições para texto legível
        const conditionMap: { [key: string]: string } = {
            "==": "igual a",
            "!=": "diferente de",
            ">":  "maior que",
            "<":  "menor que",
            ">=": "maior ou igual a",
            "<=": "menor ou igual a"
        };
        
        const variable_label = getVariableLabel(alertData.alert_variable!);
        const condition_text = conditionMap[alertData.alert_condition!] || alertData.alert_condition;
        alert_description = `Alerta para ${variable_label} do(a) ${device_name} quando o seu valor for ${condition_text} ${alertData.alert_value}${user_name ? ` será enviado para o usuário ${user_name}` : ''}`;
    }

    const alert_uid = createAlertUid();

    // Preparar metadata do alerta
    const alert_metadata: any = {
        alert_uid: alert_uid,
        alert_variable: alertData.alert_variable,
        device_id: alertData.alert_device,
        send_to: alertData.alert_send_to,
        email_enabled: alertData.aler_email || false,
        created_at: new Date().toISOString(),
        description: alert_description,
        created_by: device_id,
        lock: false,
        alert_type: is_checkin_alert ? 'checkin_central' : 'central'
    };

    if (is_checkin_alert) {
        // Metadata específico para alerta de checkin
        alert_metadata.checkin_time = alertData.checkin_time;
    } else {
        // Metadata específico para alertas normais
        alert_metadata.condition = alertData.alert_condition;
        alert_metadata.threshold_value = alertData.alert_value;
    }

    // Salvar alerta no próprio dispositivo central
    context.log(`Saving alert to device: ${alertData.alert_device}`);
    context.log(`Alert metadata:`, JSON.stringify(alert_metadata, null, 2));
    
    try {
        await resources.devices.sendDeviceData(alertData.alert_device, {
            variable: "alertas",
            value: 'enabled',
            metadata: alert_metadata
        });
        if (planLimit.plan) {
            if (organization_device_id !== alertData.alert_device) {
                await resources.devices.sendDeviceData(organization_device_id, {
                    variable: "alertas",
                    value: "enabled",
                    metadata: {
                        ...alert_metadata,
                        organization_usage_record: true,
                        source_group_device: alertData.alert_device
                    }
                });
            }

            const updatedUsage = {
                alerts: (planLimit.status?.usage.alerts || 0) + 1,
                reports: planLimit.status?.usage.reports || 0
            };
            const updatedStatus = await publishPlanStatus(resources, organization_device_id, planLimit.plan, updatedUsage);

            await resources.devices.sendDeviceData(organization_device_id, {
                variable: "plano_alertas_usados",
                value: updatedUsage.alerts,
                metadata: {
                    remaining: updatedStatus.remaining.alerts,
                    limit: planLimit.plan.alertLimit,
                    plan_id: planLimit.plan.id,
                    updated_at: new Date().toISOString()
                }
            });

            context.log(`Plan usage updated for organization ${organization_device_id}: alerts_used=${updatedUsage.alerts} alerts_remaining=${updatedStatus.remaining.alerts}`);
        }
        context.log(`Alert successfully saved to device ${alertData.alert_device}`);
        
        // Verificar se o alerta foi realmente salvo
        const verification = await resources.devices.getDeviceData(alertData.alert_device, {
            variables: ["alertas"],
            qty: 1
        });
        
        if (verification.length > 0) {
            context.log(`Verification: Alert found in device! Last alert ID: ${verification[0].id}`);
        } else {
            context.log(`WARNING: Alert was sent but not found in device data!`);
        }
        
    } catch (error) {
        context.log(`ERROR saving alert to device: ${error}`);
        throw error;
    }

    context.log(`Central alert created successfully with group: ${group_id}`);
    
    // Enviar notificação de confirmação se houver usuário
    if (alertData.alert_send_to) {
        try {
            const variable_label = getVariableLabel(alertData.alert_variable!);
            const notification_message = is_checkin_alert 
                ? `Novo alerta de checkin criado para monitorar comunicação do(a) ${device_name}`
                : `Novo alerta criado para monitorar ${variable_label} no(a) ${device_name}`;
            
            await resources.run.notificationCreate(alertData.alert_send_to, {
                title: "Alerta Criado",
                message: notification_message
            });
        } catch (error) {
            context.log("Error sending notification:", error);
        }
    }
}

export { createAlertCentral };
export default new Analysis(createAlertCentral, { token: "a-1cdf8204-73cf-46bd-b8da-a0dbd42478cd" });
