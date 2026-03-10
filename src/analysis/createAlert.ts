import { Analysis, Resources } from "@tago-io/sdk";

interface AlertData {
    alert_variable?: string;
    alert_condition?: string;
    alert_value?:   string | boolean | number;
    alert_device?: string;
    aler_email?: boolean;
    alert_send_to?: string;
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
            }
        }
    }

    context.log("Alert data extracted:", alertData);

    // Validar dados obrigatórios
    if (!alertData.alert_variable || !alertData.alert_condition || alertData.alert_value === undefined || !alertData.alert_device) {
        return context.log("Missing required alert fields");
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

    // Verificar limite de alertas apenas para não-admins (máximo 10 por device)
    // Buscar o group_id do dispositivo a ser monitorado
    let group_device_id_for_limit = null;
    
    try {
        const device_info_temp = await resources.devices.info(alertData.alert_device);
        const group_id_tag_temp = device_info_temp.tags?.find((tag: any) => tag.key === "group_id");
        
        if (group_id_tag_temp && group_id_tag_temp.value) {
            group_device_id_for_limit = group_id_tag_temp.value;
        }
    } catch (error) {
        context.log("Error fetching group_id for limit check:", error);
    }

    if (!is_admin && group_device_id_for_limit) {
        try {
            const existing_alerts = await resources.devices.getDeviceData(group_device_id_for_limit, {
                variables: ["alertas"],
                qty: 9999
            });

            // Filtrar apenas alertas para este dispositivo específico
            const device_specific_alerts = existing_alerts.filter((alert: any) => 
                alert.metadata && alert.metadata.device_id === alertData.alert_device
            );

            if (device_specific_alerts.length >= 10) {
                context.log(`Alert limit reached: ${device_specific_alerts.length}/10 alerts already exist for device ${alertData.alert_device}`);
                
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
                
                return context.log("Cannot create alert: maximum limit of 10 alerts reached");
            }

            context.log(`Current alerts for device ${alertData.alert_device}: ${device_specific_alerts.length}/10`);
        } catch (error) {
            context.log("Error checking alert limit:", error);
        }
    }

    // Mapear condições para texto legível
    const conditionMap: { [key: string]: string } = {
        "==": "igual a",
        "!=": "diferente de",
        ">": "maior que",
        "<": "menor que",
        ">=": "maior ou igual a",
        "<=": "menor ou igual a"
    };

    const condition_text = conditionMap[alertData.alert_condition] || alertData.alert_condition;

    // Criar descrição legível do alerta
    const alert_description = `Alerta criado para a variável ${alertData.alert_variable} quando o seu valor for ${condition_text} ${alertData.alert_value}${user_name ? ` e será enviado para o usuário ${user_name}` : ''}`;

    // Buscar o group_id do dispositivo a ser monitorado (nas tags)
    const device_info = await resources.devices.info(alertData.alert_device);
    const group_id_tag = device_info.tags?.find((tag: any) => tag.key === "group_id");

    if (!group_id_tag || !group_id_tag.value) {
        return context.log("No group_id tag found for the alert device");
    }

    const group_device_id = group_id_tag.value;
    context.log(`Saving alert in group device: ${group_device_id} for sensor: ${alertData.alert_device}`);

    // Salvar alerta no dispositivo do grupo
    await resources.devices.sendDeviceData(group_device_id, {
        variable: "alertas",
        value: 'enabled',
        metadata: {
            alert_variable: alertData.alert_variable,
            condition: alertData.alert_condition,
            threshold_value: alertData.alert_value,
            device_id: alertData.alert_device, // ID do dispositivo sensor a ser monitorado
            send_to: alertData.alert_send_to,
            email_enabled: alertData.aler_email || false,
            created_at: new Date().toISOString(),
            description: alert_description,
            created_by: device_id  // Salvar quem criou o alerta
        }
    });

    context.log(`Alert created successfully with group: ${group_id}`);
    
    // Enviar notificação de confirmação se houver usuário
    if (alertData.alert_send_to) {
        try {
            await resources.run.notificationCreate(alertData.alert_send_to, {
                title: "Alerta Criado",
                message: `Novo alerta criado para monitorar a variável ${alertData.alert_variable} no dispositivo`
            });
        } catch (error) {
            context.log("Error sending notification:", error);
        }
    }
}

export { createAlert };
export default new Analysis(createAlert, { token: "a-c46fc536-82c7-458f-b356-07c79d43bb82" });
