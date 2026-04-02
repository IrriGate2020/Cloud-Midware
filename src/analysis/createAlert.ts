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

async function createAlert(context: any, scope: any[]) {
    console.log("Running Analysis - Creating Alert");
    console.log(scope);

    if (!scope || scope.length === 0) {
        return context.log("No data in scope");
    }

    const token = context.token;
    const resources = new Resources({ token });

    // Extrair dados do scope baseado no grupo
    const group_id = scope[0].group;
    const device_id = scope[0].device;

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
        // Buscar o group_id do dispositivo a ser monitorado
        let group_device_id_for_limit = null;
        
        try {
            const device_info_temp = await resources.devices.info(alertData.alert_device);
            const group_id_tag_temp = device_info_temp.tags?.find((tag: any) => tag.key === "group_id");
            
            if (group_id_tag_temp && group_id_tag_temp.value) {
                group_device_id_for_limit = group_id_tag_temp.value;
            } else {
                context.log("No group_id tag found for alert device - cannot verify alert limit");
                return context.log("Cannot create alert: unable to verify alert limit");
            }
        } catch (error) {
            context.log("Error fetching group_id for limit check:", error);
            return context.log("Cannot create alert: unable to verify alert limit");
        }

        // Verificar alertas existentes do usuário
        try {
            const existing_alerts = await resources.devices.getDeviceData(group_device_id_for_limit, {
                variables: ["alertas"],
                qty: 9999
            });

            // Filtrar apenas alertas deste usuário específico (independente do dispositivo)
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

    // Buscar o group_id do dispositivo a ser monitorado (nas tags)
    const device_info = await resources.devices.info(alertData.alert_device);
    const device_name = device_info.name || alertData.alert_device;

    // Mapear condições para texto legível
    const conditionMap: { [key: string]: string } = {
        "==": "igual a",
        "!=": "diferente de",
        ">": "maior que",
        "<": "menor que",
        ">=": "maior ou igual a",
        "<=": "menor ou igual a"
    };

    // Criar descrição legível do alerta
    let alert_description: string;
    
    if (is_checkin_alert) {
        alert_description = `Alerta de checkin criado para monitorar comunicação do dispositivo. Notificação será enviada se o dispositivo ficar ${alertData.checkin_time} horas sem comunicar${user_name ? ` e será enviado para o usuário ${user_name}` : ''}`;
    } else {
        const condition_text = conditionMap[alertData.alert_condition!] || alertData.alert_condition;
        alert_description = `Alerta para o(a) ${alertData.alert_variable} do(a) ${device_name} quando o seu valor for ${condition_text} ${alertData.alert_value}${user_name ? ` será enviado para o usuário ${user_name}` : ''}`;
    }
    const group_id_tag = device_info.tags?.find((tag: any) => tag.key === "group_id");

    if (!group_id_tag || !group_id_tag.value) {
        return context.log("No group_id tag found for the alert device");
    }

    const group_device_id = group_id_tag.value;
    context.log(`Saving alert in group device: ${group_device_id} for sensor: ${alertData.alert_device}`);

    // Preparar metadata baseado no tipo de alerta
    const alert_metadata: any = {
        alert_variable: alertData.alert_variable,
        device_id: alertData.alert_device,
        send_to: alertData.alert_send_to,
        email_enabled: alertData.aler_email || false,
        created_at: new Date().toISOString(),
        description: alert_description,
        created_by: device_id,
        lock: false
    };

    if (is_checkin_alert) {
        // Metadata específico para alerta de checkin
        alert_metadata.checkin_time = alertData.checkin_time;
        alert_metadata.alert_type = 'checkin';
    } else {
        // Metadata específico para alerta normal
        alert_metadata.condition = alertData.alert_condition;
        alert_metadata.threshold_value = alertData.alert_value;
        alert_metadata.alert_type = 'normal';
    }

    // Salvar alerta no dispositivo do grupo
    await resources.devices.sendDeviceData(group_device_id, {
        variable: "alertas",
        value: 'enabled',
        metadata: alert_metadata
    });

    context.log(`Alert created successfully with group: ${group_id}`);
    
    // Enviar notificação de confirmação se houver usuário
    if (alertData.alert_send_to) {
        try {
            const notification_message = is_checkin_alert 
                ? `Novo alerta de checkin criado. Você será notificado se o dispositivo ficar ${alertData.checkin_time} horas sem comunicar.`
                : `Novo alerta criado para monitorar o(a) ${alertData.alert_variable} no(a) ${device_name}`;
            
            await resources.run.notificationCreate(alertData.alert_send_to, {
                title: "Alerta Criado",
                message: notification_message
            });
        } catch (error) {
            context.log("Error sending notification:", error);
        }
    }
}

export { createAlert };
export default new Analysis(createAlert, { token: "a-c46fc536-82c7-458f-b356-07c79d43bb82" });
