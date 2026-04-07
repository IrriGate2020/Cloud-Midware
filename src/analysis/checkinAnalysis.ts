import { Analysis, Resources } from "@tago-io/sdk";

interface CheckinAlertMetadata {
    alert_variable: string;
    alert_type: string;
    checkin_time: number;  // Tempo em horas
    device_id: string;
    send_to?: string;
    email_enabled: boolean;
    created_at: string;
    description?: string;
    lock?: boolean;
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
    'Ph': 'Ph'
};

// Função para obter o label da variável
function getVariableLabel(variable: string): string {
    return variableLabels[variable] || variable;
}

async function checkinAnalysis(context: any, scope: any[]) {
    context.log("Starting Checkin Analysis - Checking device communication");

    const token = context.token;
    const resources = new Resources({ token });

    try {
        // 1. Buscar todos os dispositivos do tipo "group" para verificar alertas
        const all_devices = await resources.devices.list({
            amount: 1000,
            fields: ["id", "name", "tags"],
            filter: {}
        });

        // Filtrar apenas dispositivos que são grupos (connector type)
        const group_devices = all_devices.filter((device: any) => {
            const type_tag = device.tags?.find((tag: any) => tag.key === "device_type");
            return type_tag && type_tag.value === "connector";
        });

        context.log(`Found ${group_devices.length} group devices to check`);

        // 2. Para cada grupo, buscar alertas de checkin configurados
        for (const group_device of group_devices) {
            const group_device_id = group_device.id;
            context.log(`Checking alerts for group device: ${group_device_id}`);

            // Buscar todos os alertas do grupo
            const all_alerts_data = await resources.devices.getDeviceData(group_device_id, {
                variables: ["alertas"],
                qty: 9999
            });

            if (!all_alerts_data.length) {
                context.log(`No alerts configured in group device ${group_device_id}`);
                continue;
            }

            // Filtrar apenas alertas de checkin
            const checkin_alerts = all_alerts_data.filter((alert) => {
                const alert_metadata = alert.metadata as CheckinAlertMetadata;
                return alert_metadata && alert_metadata.alert_type === 'checkin' && alert.value === 'enabled';
            });

            if (!checkin_alerts.length) {
                context.log(`No checkin alerts configured for group ${group_device_id}`);
                continue;
            }

            context.log(`Found ${checkin_alerts.length} checkin alerts in group ${group_device_id}`);

            // 3. Processar cada alerta de checkin
            for (const alert_data of checkin_alerts) {
                const alert_metadata = alert_data.metadata as CheckinAlertMetadata;
                const device_id = alert_metadata.device_id;
                const checkin_time_hours = alert_metadata.checkin_time;

                context.log(`Checking device ${device_id} - should communicate within ${checkin_time_hours} hours`);

                try {
                    // Buscar última comunicação do dispositivo
                    const last_data = await resources.devices.getDeviceData(device_id, {
                        variables: ["data"],  // Pode ajustar para a variável que indica comunicação
                        qty: 1
                    });

                    let is_offline = false;
                    let hours_offline = 0;

                    if (!last_data.length) {
                        context.log(`No data found for device ${device_id} - considering offline`);
                        is_offline = true;
                    } else {
                        const last_communication = new Date(last_data[0].time);
                        const now = new Date();
                        const time_diff_ms = now.getTime() - last_communication.getTime();
                        hours_offline = time_diff_ms / (1000 * 60 * 60);

                        context.log(`Device ${device_id} last communication: ${last_communication.toISOString()} (${hours_offline.toFixed(2)} hours ago)`);

                        // Verificar se passou o tempo configurado
                        if (hours_offline >= checkin_time_hours) {
                            is_offline = true;
                        }
                    }

                    const is_locked = alert_metadata.lock === true;

                    if (is_offline) {
                        // Dispositivo está offline
                        context.log(`Device ${device_id} is offline for ${hours_offline.toFixed(2)} hours`);

                        if (is_locked) {
                            context.log(`Alert is locked - skipping notification to avoid spam`);
                        } else {
                            // Enviar notificação
                            context.log(`Sending notification - device ${device_id} is not communicating`);

                            if (alert_metadata.send_to) {
                                try {
                                    // Buscar info do dispositivo para nome
                                    const device_info = await resources.devices.info(device_id);
                                    const device_name = device_info.name || device_id;

                                    await resources.run.notificationCreate(alert_metadata.send_to, {
                                        title: `Alerta: Dispositivo Sem Comunicação`,
                                        message: `O dispositivo ${device_name} está sem comunicar há ${hours_offline.toFixed(1)} horas (limite: ${checkin_time_hours}h)`
                                    });
                                    context.log(`Notification sent to user ${alert_metadata.send_to}`);

                                    // TODO: Se email_enabled for true, enviar email também
                                } catch (error) {
                                    context.log(`Error sending notification: ${error}`);
                                }
                            }

                            // Registrar o disparo do alerta
                            const variable_label = getVariableLabel('checkin');
                            await resources.devices.sendDeviceData(group_device_id, {
                                variable: "alert_triggered",
                                value: variable_label,
                                metadata: {
                                    alert_type: "checkin",
                                    alert_variable: "checkin",
                                    alert_variable_label: variable_label,
                                    device_id: device_id,
                                    hours_offline: hours_offline,
                                    checkin_time: checkin_time_hours,
                                    timestamp: new Date().toISOString()
                                }
                            });

                            // Ativar o lock
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
                                context.log(`Checkin alert lock activated for device ${device_id}`);
                            } catch (err) {
                                context.log(`Error updating lock: ${err}`);
                            }
                        }
                    } else {
                        // Dispositivo está comunicando normalmente
                        context.log(`Device ${device_id} is online - last communication ${hours_offline.toFixed(2)} hours ago`);

                        // Se o lock estava ativo, resetar
                        if (is_locked) {
                            context.log(`Device is back online - resetting lock for device ${device_id}`);
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
                                context.log(`Checkin alert lock reset for device ${device_id} - ready for next trigger`);
                            } catch (err) {
                                context.log(`Error resetting lock: ${err}`);
                            }
                        }
                    }
                } catch (error) {
                    context.log(`Error checking device ${device_id}: ${error}`);
                }
            }
        }

        context.log("Checkin analysis completed");
    } catch (error) {
        context.log(`Error in checkin analysis: ${error}`);
    }
}

export { checkinAnalysis };
export default new Analysis(checkinAnalysis, { token: "a-bae808ee-4460-4042-a1e7-8e9f27ff2624" });
