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
    lock?: boolean;
    alert_type: string;
}

// Mapeamento de variáveis para labels das centrais
const variableLabels: { [key: string]: string } = {
    'sboia': 'Status Boia - Caixa cheia (1), Caixa vazia(0)',
    'sboia1': 'Status Boia 1 - Caixa cheia (1), Caixa vazia(0)',
    'sboia2': 'Status Boia 2 - Caixa cheia (1), Caixa vazia(0)',
    'tempInt': 'Temperatura Interna'
};

// Função para obter o label da variável
function getVariableLabel(variable: string): string {
    return variableLabels[variable] || variable;
}

async function alertAnalysisCentral(context: any, scope: any[]) {
    if (!scope.length) {
        return context.log("No data in scope");
    }

    const data = scope[0];
    const device_id = scope[0].device; // Dispositivo central que disparou a análise
    const variable_name = scope[0].variable;

    context.log(`Central Alert Analysis triggered for device: ${device_id}, variable: ${variable_name}`);

    const token = context.token;
    const resources = new Resources({ token });

    // Para centrais, o próprio dispositivo armazena os alertas (não tem group_id)
    const central_device_id = device_id;
    context.log(`Central device ID: ${central_device_id}`);

    // Buscar todos os alertas configurados na central
    const all_alerts_data = await resources.devices.getDeviceData(central_device_id, {
        variables: ["alertas"],
        qty: 9999
    });

    if (!all_alerts_data.length) {
        context.log("No alerts configured in central device");
        return;
    }

    context.log(`Found ${all_alerts_data.length} alert(s) in central device`);

    // Filtrar apenas alertas de central (não de sensores)
    const central_alerts = all_alerts_data.filter((alert: any) => {
        const metadata = alert.metadata as AlertMetadata;
        return metadata && metadata.alert_type === 'central';
    });

    if (!central_alerts.length) {
        context.log("No central alerts configured in this device");
        return;
    }

    context.log(`Found ${central_alerts.length} central alert(s) to process`);

    // Buscar informações do dispositivo central
    const device_info = await resources.devices.info(device_id);

    // Processar cada alerta
    for (const alert_data of central_alerts) {
        const alert_metadata = alert_data.metadata as AlertMetadata;
        
        // Verificar se o alerta está habilitado
        if (alert_data.value !== 'enabled') {
            context.log(`Alert ${alert_data.variable} is disabled, skipping`);
            continue;
        }

        const alert_variable = alert_metadata.alert_variable;

        // Buscar o valor atual da variável na central
        try {
            let current_value: any = null;
            let value_found = false;

            // Buscar a variável diretamente
            const target_data = await resources.devices.getDeviceData(device_id, {
                variables: [alert_variable],
                qty: 1
            });

            if (target_data.length > 0) {
                current_value = target_data[0].value;
                value_found = true;
            }

            if (!value_found) {
                context.log(`No data found for variable ${alert_variable} in central ${device_id}`);
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
                            const variable_label = getVariableLabel(alert_variable);
                            
                            await resources.run.notificationCreate(alert_metadata.send_to, {
                                title: `Alerta: ${variable_label}`,
                                message: `A condição do alerta foi atingida para o(a) ${device_name}: ${variable_label} ${condition} ${threshold_value}. Valor atual: ${current_value}`
                            });
                            context.log(`Push notification sent to user ${alert_metadata.send_to}`);
                        } catch (error) {
                            context.log(`Error sending notification: ${error}`);
                        }
                    } else {
                        context.log(`No user (send_to) configured for this alert`);
                    }

                    // Registrar o disparo do alerta no dispositivo central
                    const variable_label = getVariableLabel(alert_variable);
                    await resources.devices.sendDeviceData(central_device_id, {
                        variable: "alert_triggered",
                        value: variable_label,
                        metadata: {
                            alert_group: alert_data.group,
                            alert_variable: alert_variable,
                            alert_variable_label: variable_label,
                            device_id: device_id,
                            condition: condition,
                            threshold: threshold_value,
                            current_value: current_value,
                            timestamp: new Date().toISOString(),
                            alert_type: 'central'
                        }
                    });

                    // Ativar o lock para evitar alertas repetitivos
                    try {
                        await resources.devices.deleteDeviceData(central_device_id, { ids: [alert_data.id] });
                        await resources.devices.sendDeviceData(central_device_id, {
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
                        await resources.devices.deleteDeviceData(central_device_id, { ids: [alert_data.id] });
                        await resources.devices.sendDeviceData(central_device_id, {
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
            context.log(`Error checking alert for central ${device_id}: ${error}`);
        }
    }

    context.log("Central alert analysis completed");
}

export { alertAnalysisCentral };
export default new Analysis(alertAnalysisCentral, { token: "a-7359220f-cf88-41de-be9a-9ee406356f36" });
