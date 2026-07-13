import { Analysis, Resources } from "@tago-io/sdk";
import { sendRunNotification } from "./notificationUtils";

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

// Mapeamento de variáveis para labels
const variableLabels: { [key: string]: string } = {
    'OUTST': 'Acionamento: Ligou(1) - Desligou(0)',
    'checkin': 'IrrigaPay: Ligou(1) - Desligou(0)',
    'ONDUR': 'Duração do Acionamento',
    'ERRO': 'Erro de Leitura do Sensor',
    'HUM': 'Umidade',
    'TEMP': 'Temperatura',
    'PW': 'EC do Solo',
    'CON': 'EC da Água',
    'NIT': 'Nitrogênio',
    'PHO': 'Fósforo',
    'POT': 'Potássio',
    'LUX': 'Luminosidade',
    'PH': 'percentual de Hidrogênio',
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

function parseTimeLikeValue(value: any): number | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const raw = String(value).trim().replace(",", ".");
    const timeMatch = raw.match(/^(\d{1,4}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (timeMatch) {
        const hours = Number(timeMatch[1]);
        const minutes = Number(timeMatch[2]);
        const seconds = Number(timeMatch[3] || 0);
        if ([hours, minutes, seconds].every(Number.isFinite)) return hours * 60 + minutes + seconds / 60;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function getComparableValue(variable: string, value: any): number | null {
    if (["ONDUR", "ONSTR"].includes(variable)) return parseTimeLikeValue(value);
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
}

function evaluateCondition(variable: string, currentValue: any, condition: string, thresholdValue: any): boolean {
    if (condition === "==" || condition === "!=") {
        const currentComparable = getComparableValue(variable, currentValue);
        const thresholdComparable = getComparableValue(variable, thresholdValue);
        const isEqual = currentComparable !== null && thresholdComparable !== null ? currentComparable === thresholdComparable : String(currentValue) === String(thresholdValue);
        return condition === "==" ? isEqual : !isEqual;
    }
    const currentNum = getComparableValue(variable, currentValue);
    const thresholdNum = getComparableValue(variable, thresholdValue);
    if (currentNum === null || thresholdNum === null) return false;
    if (condition === ">=") return currentNum >= thresholdNum;
    if (condition === ">") return currentNum > thresholdNum;
    if (condition === "<=") return currentNum <= thresholdNum;
    if (condition === "<") return currentNum < thresholdNum;
    return false;
}

function getLegacyErrorAlertValue(metadata: any): { value: number; metadata: any } | null {
    if (!metadata) return null;
    if (metadata.erro_ativo !== undefined) {
        return { value: metadata.erro_ativo ? 1 : 0, metadata: { label: metadata.erro_codigos || "Erro de leitura", description: metadata.erro_descricao || "Erro de leitura ativo", severity: metadata.erro_ativo ? "critical" : "ok" } };
    }
    if (metadata.ERRO && typeof metadata.ERRO === "object") {
        const activeCodes = Object.entries(metadata.ERRO).filter(([, value]) => Number(value) > 0).map(([code]) => code);
        return { value: activeCodes.length > 0 ? 1 : 0, metadata: { label: activeCodes.join(", ") || "Sem erro", description: activeCodes.length ? "Codigos ativos: " + activeCodes.join(", ") : "Sem erro de leitura ativo", severity: activeCodes.length ? "critical" : "ok" } };
    }
    return null;
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
            let current_metadata: any = {};

            // Primeiro, tentar buscar a variável diretamente
            const target_data = await resources.devices.getDeviceData(device_id, {
                variables: [alert_variable],
                qty: 1
            });

            if (target_data.length > 0) {
                current_value = target_data[0].value;
                current_metadata = target_data[0].metadata || {};
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
                    if (alert_variable === "ERRO") {
                        const errorAlert = getLegacyErrorAlertValue(metadata);
                        if (errorAlert) {
                            current_value = errorAlert.value;
                            current_metadata = errorAlert.metadata;
                            value_found = true;
                            context.log(`Found legacy ERRO status in 'data' metadata: ${current_value}`);
                        }
                    } else if (alert_variable in metadata) {
                        current_value = metadata[alert_variable];
                        current_metadata = {};
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
            const should_trigger = evaluateCondition(alert_variable, current_value, condition, threshold_value);

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
                            const error_detail = current_metadata.description ? ` Detalhe: ${current_metadata.description}` : '';
                            
                            await sendRunNotification(resources, alert_metadata.send_to, `Alerta: ${variable_label}`, `A condição do alerta foi atingida para o(a) ${device_name}: ${variable_label} ${condition} ${threshold_value}. Valor atual: ${current_value}.${error_detail}`, context);
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
                    const variable_label = getVariableLabel(alert_variable);
                    await resources.devices.sendDeviceData(group_device_id, {
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
                            error_label: current_metadata.label,
                            error_description: current_metadata.description,
                            error_severity: current_metadata.severity,
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