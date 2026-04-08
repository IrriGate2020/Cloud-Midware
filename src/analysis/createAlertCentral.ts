import { Analysis, Resources } from "@tago-io/sdk";

interface AlertData {
    alert_variable?: string;
    alert_condition?: string;
    alert_value?:   string | boolean | number;
    alert_device?: string;
    aler_email?: boolean;
    alert_send_to?: string;
    checkin_time?: number;  // Tempo em horas para alerta de checkin
}

// Mapeamento de variáveis para labels das centrais
const variableLabels: { [key: string]: string } = {
    'sboia': 'Status Boia - Caixa cheia (1), Caixa vazia(0)',
    'sboia1': 'Status Boia 1 - Caixa cheia (1), Caixa vazia(0)',
    'sboia2': 'Status Boia 2 - Caixa cheia (1), Caixa vazia(0)',
    'tempInt': 'Temperatura Interna',
    'checkin': 'Comunicação da Central'
};

// Função para obter o label da variável
function getVariableLabel(variable: string): string {
    return variableLabels[variable] || variable;
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

    // Verificar se o usuário é admin (sem limite de alertas)
    let is_admin = false;
    let user_name = "";
    
    if (alertData.alert_send_to) {
        try {
            const user_info = await resources.run.userInfo(alertData.alert_send_to);
            const user_tags = user_info.tags || [];
            
            // Verificar se tem tag access: admin
            is_admin = user_tags.some((tag: any) => tag.key === 'access' && tag.value === 'admin');
            
            // Pegar nome do usuário
            user_name = user_info.name || alertData.alert_send_to;
            
            if (is_admin) {
                context.log("User is admin - no alert limit applied");
            }
        } catch (error) {
            context.log("Error checking user info:", error);
            user_name = alertData.alert_send_to;
        }
    }

    // Verificar limite de alertas apenas para não-admins (máximo 10 alertas por usuário)
    if (!is_admin) {
        // Para centrais, o dispositivo em si é o grupo (não tem tag group_id)
        const central_device_id = alertData.alert_device;

        // Verificar alertas existentes do usuário
        try {
            const existing_alerts = await resources.devices.getDeviceData(central_device_id, {
                variables: ["alertas"],
                qty: 9999
            });

            // Filtrar apenas alertas deste usuário específico
            const user_alerts = existing_alerts.filter((alert: any) => 
                alert.metadata && alert.metadata.send_to === alertData.alert_send_to
            );

            if (user_alerts.length >= 10) {
                context.log(`Alert limit reached: ${user_alerts.length}/10 alerts already exist for user ${alertData.alert_send_to}`);
                
                // Enviar notificação ao usuário sobre o limite
                if (alertData.alert_send_to) {
                    try {
                        await resources.run.notificationCreate(alertData.alert_send_to, {
                            title: "Limite de Alertas Atingido",
                            message: "Você já possui o número máximo de 10 alertas configurados. Delete um alerta existente para criar um novo."
                        });
                    } catch (error) {
                        context.log("Error sending limit notification:", error);
                    }
                }
                
                return context.log("Cannot create alert: maximum limit of 10 alerts reached for this user");
            }

            context.log(`Current alerts for user ${alertData.alert_send_to}: ${user_alerts.length}/10`);
        } catch (error) {
            context.log("Error checking alert limit:", error);
            return context.log("Cannot create alert: unable to verify alert limit");
        }
    }

    // Buscar informações do dispositivo central
    const device_info = await resources.devices.info(alertData.alert_device);
    const device_name = device_info.name || alertData.alert_device;

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

    // Preparar metadata do alerta
    const alert_metadata: any = {
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
