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
    lock?: boolean;
    alert_type: string;
}

// Mapeamento de variáveis para labels das centrais
const variableLabels: { [key: string]: string } = {
    'sboia': 'Status Boia - Caixa cheia (1), Caixa vazia(0)',
    'sboia1': 'Status Boia 1 - Caixa cheia (1), Caixa vazia(0)',
    'sboia2': 'Status Boia 2 - Caixa cheia (1), Caixa vazia(0)',
    'tempInt': 'Temperatura Interna',
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

function getComparableValue(value: any): number | null {
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
}

function evaluateCondition(currentValue: any, condition: string, thresholdValue: any): boolean {
    if (condition === "==" || condition === "!=") {
        const currentComparable = getComparableValue(currentValue);
        const thresholdComparable = getComparableValue(thresholdValue);
        const isEqual = currentComparable !== null && thresholdComparable !== null ? currentComparable === thresholdComparable : String(currentValue) === String(thresholdValue);
        return condition === "==" ? isEqual : !isEqual;
    }
    const currentNum = getComparableValue(currentValue);
    const thresholdNum = getComparableValue(thresholdValue);
    if (currentNum === null || thresholdNum === null) return false;
    if (condition === ">=") return currentNum >= thresholdNum;
    if (condition === ">") return currentNum > thresholdNum;
    if (condition === "<=") return currentNum <= thresholdNum;
    if (condition === "<") return currentNum < thresholdNum;
    return false;
}

function getLegacyErrorAlertValue(metadata: any): { value: number; metadata: any } | null {
    if (!metadata) return null;
    if (metadata.erro_ativo !== undefined) return { value: metadata.erro_ativo ? 1 : 0, metadata: { label: metadata.erro_codigos || "Erro de leitura", description: metadata.erro_descricao || "Erro de leitura ativo", severity: metadata.erro_ativo ? "critical" : "ok" } };
    if (metadata.ERRO && typeof metadata.ERRO === "object") {
        const activeCodes = Object.entries(metadata.ERRO).filter(([, value]) => Number(value) > 0).map(([code]) => code);
        return { value: activeCodes.length > 0 ? 1 : 0, metadata: { label: activeCodes.join(", ") || "Sem erro", description: activeCodes.length ? "Codigos ativos: " + activeCodes.join(", ") : "Sem erro de leitura ativo", severity: activeCodes.length ? "critical" : "ok" } };
    }
    return null;
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
            let current_metadata: any = {};

            // Buscar a variável diretamente
            const target_data = await resources.devices.getDeviceData(device_id, {
                variables: [alert_variable],
                qty: 1
            });

            if (target_data.length > 0) {
                current_value = target_data[0].value;
                current_metadata = target_data[0].metadata || {};
                value_found = true;
            } else if (alert_variable === "ERRO") {
                const dataVariable = await resources.devices.getDeviceData(device_id, { variables: ["data"], qty: 1 });
                const errorAlert = getLegacyErrorAlertValue(dataVariable[0]?.metadata);
                if (errorAlert) {
                    current_value = errorAlert.value;
                    current_metadata = errorAlert.metadata;
                    value_found = true;
                }
            }

            if (!value_found) {
                context.log(`No data found for variable ${alert_variable} in central ${device_id}`);
                continue;
            }

            const condition = alert_metadata.condition;
            const threshold_value = alert_metadata.threshold_value;

            context.log(`Checking alert: ${alert_variable} ${condition} ${threshold_value}, current: ${current_value}`);
            const should_trigger = evaluateCondition(current_value, condition, threshold_value);

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
                            error_label: current_metadata.label,
                            error_description: current_metadata.description,
                            error_severity: current_metadata.severity,
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
