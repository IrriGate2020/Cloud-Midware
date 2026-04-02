import { Analysis, Resources } from "@tago-io/sdk";

interface AlertMetadata {
    alert_variable: string;
    condition: string;
    threshold_value: string | boolean | number;
    device_id: string;
    send_to?: string;
    email_enabled: boolean;
    created_at: string;
    description?: string;
    lock?: boolean;  // Sistema de lock para evitar alertas repetitivos
}

async function alertAnalysis(context: any, scope: any[]) {
    if (!scope.length) {
        return context.log("No data in scope");
    }

    const data = scope[0];
    const metadata = data.metadata || {};
    const device_id = scope[0].device; // Dispositivo que disparou a análise (sensor)
    const variable_name = scope[0].variable;

    context.log(`Alert Analysis triggered for device: ${device_id}, variable: ${variable_name}`);

    const token = context.token;
    const resources = new Resources({ token });

    // 1. Buscar o group_id do dispositivo que disparou (nas tags)
    const device_info = await resources.devices.info(device_id);
    const group_id_tag = device_info.tags?.find((tag: any) => tag.key === "group_id");

    if (!group_id_tag || !group_id_tag.value) {
        context.log("No group_id tag found for this device");
        return;
    }

    const group_device_id = group_id_tag.value;
    context.log(`Group device ID: ${group_device_id}`);

    // 2. Buscar todos os alertas configurados no dispositivo do grupo
    const all_alerts_data = await resources.devices.getDeviceData(group_device_id, {
        variables: ["alertas"],
        qty: 9999
    });

    if (!all_alerts_data.length) {
        context.log("No alerts configured in group device");
        return;
    }

    context.log(`Found ${all_alerts_data.length} alert variables in group device`);

    // 3. Filtrar alertas que são para este dispositivo específico
    const device_alerts = all_alerts_data.filter((alert) => {
        const alert_metadata = alert.metadata as AlertMetadata;
        return alert_metadata && alert_metadata.device_id === device_id;
    });

    if (!device_alerts.length) {
        context.log(`No alerts configured for device ${device_id}`);
        return;
    }

    context.log(`Found ${device_alerts.length} alerts for this device`);

    // 4. Processar cada alerta
    for (const alert_data of device_alerts) {
        const alert_metadata = alert_data.metadata as AlertMetadata;
        
        // Verificar se o alerta está habilitado
        if (alert_data.value !== 'enabled') {
            context.log(`Alert ${alert_data.variable} is disabled, skipping`);
            continue;
        }

        const alert_variable = alert_metadata.alert_variable;

        // 5. Buscar o valor atual da variável no dispositivo que disparou
        try {
            let current_value: any = null;
            let value_found = false;

            // Primeiro, tentar buscar a variável diretamente
            const target_data = await resources.devices.getDeviceData(device_id, {
                variables: [alert_variable],
                qty: 1
            });

            if (target_data.length > 0) {
                current_value = target_data[0].value;
                value_found = true;
            } else {
                // Se não encontrou como variável standalone, buscar na variável "data" metadata
                context.log(`Variable ${alert_variable} not found as standalone, checking 'data' metadata`);
                
                const data_variable = await resources.devices.getDeviceData(device_id, {
                    variables: ["data"],
                    qty: 1
                });

                if (data_variable.length > 0 && data_variable[0].metadata) {
                    const metadata = data_variable[0].metadata;
                    if (alert_variable in metadata) {
                        current_value = metadata[alert_variable];
                        value_found = true;
                        context.log(`Found ${alert_variable} in 'data' metadata: ${current_value}`);
                    }
                }
            }

            if (!value_found) {
                context.log(`No data found for variable ${alert_variable} in device ${device_id}`);
                continue;
            }
            const condition = alert_metadata.condition;
            const threshold_value = alert_metadata.threshold_value;

            context.log(`Checking alert: ${alert_variable} ${condition} ${threshold_value}, current: ${current_value}`);

            let should_trigger = false;

            // Verificar condição
            if (condition === "==") {
                // Para comparação de igualdade, converter para string para comparar
                should_trigger = String(current_value) === String(threshold_value);
            } else if (condition === "!=") {
                should_trigger = String(current_value) !== String(threshold_value);
            } else {
                // Para comparações numéricas
                const current_num = parseFloat(String(current_value));
                const threshold_num = parseFloat(String(threshold_value));

                if (!isNaN(current_num) && !isNaN(threshold_num)) {
                    if (condition === ">=") should_trigger = current_num >= threshold_num;
                    else if (condition === ">") should_trigger = current_num > threshold_num;
                    else if (condition === "<=") should_trigger = current_num <= threshold_num;
                    else if (condition === "<") should_trigger = current_num < threshold_num;
                }
            }

            // Disparar notificação se necessário
            if (should_trigger) {
                context.log(`Alert condition met for ${alert_variable}!`);

                // Verificar o estado do lock
                const is_locked = alert_metadata.lock === true;

                if (is_locked) {
                    context.log(`Alert is locked - skipping notification to avoid spam`);
                } else {
                    context.log(`Alert triggered for ${alert_variable}! Sending notifications...`);

                    // Sempre enviar notificação push se houver usuário
                    if (alert_metadata.send_to) {
                        try {
                            // Buscar nome do dispositivo
                            const device_name = device_info.name || device_id;
                            
                            await resources.run.notificationCreate(alert_metadata.send_to, {
                                title: `Alerta: ${alert_variable}`,
                                message: `A condição do alerta foi atingida para o(a) ${device_name}: ${alert_variable} ${condition} ${threshold_value}. Valor atual: ${current_value}`
                            });
                            context.log(`Push notification sent to user ${alert_metadata.send_to}`);
                        } catch (error) {
                            context.log(`Error sending notification: ${error}`);
                        }

                        // TODO: Se email_enabled for true, enviar email também
                        // if (alert_metadata.email_enabled) {
                        //     await resources.run.emailSend(...);
                        // }
                    } else {
                        context.log(`No user (send_to) configured for this alert`);
                    }

                    // Registrar o disparo do alerta no dispositivo do grupo
                    await resources.devices.sendDeviceData(group_device_id, {
                        variable: "alert_triggered",
                        value: alert_variable,
                        metadata: {
                            alert_group: alert_data.group,
                            alert_variable: alert_variable,
                            device_id: device_id,
                            condition: condition,
                            threshold: threshold_value,
                            current_value: current_value,
                            timestamp: new Date().toISOString()
                        }
                    });

                    // Ativar o lock para evitar alertas repetitivos
                    // Deletar alerta antigo e recriar com lock = true
                    try {
                        await resources.devices.deleteDeviceData(group_device_id, { ids: [alert_data.id] });
                        await resources.devices.sendDeviceData(group_device_id, {
                            variable: "alertas",
                            value: alert_data.value,
                            group: alert_data.group,
                            metadata: {
                                ...alert_metadata,
                                lock: true
                            }
                        });
                        context.log(`Alert lock activated for ${alert_variable}`);
                    } catch (err) {
                        context.log(`Error updating lock: ${err}`);
                    }
                }
            } else {
                // Condição não atendida - resetar o lock se estiver ativado
                const is_locked = alert_metadata.lock === true;
                
                if (is_locked) {
                    context.log(`Condition not met - resetting lock for ${alert_variable}`);
                    // Deletar alerta antigo e recriar com lock = false
                    try {
                        await resources.devices.deleteDeviceData(group_device_id, { ids: [alert_data.id] });
                        await resources.devices.sendDeviceData(group_device_id, {
                            variable: "alertas",
                            value: alert_data.value,
                            group: alert_data.group,
                            metadata: {
                                ...alert_metadata,
                                lock: false
                            }
                        });
                        context.log(`Alert lock reset for ${alert_variable} - ready for next trigger`);
                    } catch (err) {
                        context.log(`Error resetting lock: ${err}`);
                    }
                }
            }
        } catch (error) {
            context.log(`Error checking alert for device ${device_id}: ${error}`);
        }
    }

    context.log("Alert analysis completed");
}

export { alertAnalysis };
export default new Analysis(alertAnalysis, { token: "a-bae808ee-4460-4042-a1e7-8e9f27ff2624" });