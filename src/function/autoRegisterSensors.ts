// Este script detecta quando um dispositivo IrrigaPlay envia dados com configDevice="true"
// e automaticamente cadastra os sensores na plataforma TagoIO
//
// O fluxo é o seguinte:
// 1. Detecta a flag configDevice="true" na mensagem MQTT
// 2. Extrai o serial number (SN) da central e os dados dos sensores
// 3. Busca a central existente na TagoIO pelo serial number
// 4. Copia as tags group_id e organization_id da central
// 5. Para cada sensor em data.sens, cria um dispositivo na TagoIO
// 6. O serial number de cada sensor segue o padrão: {SN_central}_{numero_sensor}

import { Account } from "@tago-io/sdk";
import axios from "axios";

// Token da conta TagoIO com permissões para criar dispositivos
// Este token deve ser configurado como variável de ambiente
const ACCOUNT_TOKEN = "ff300c89-19a5-4446-9571-f276837dee18";
const DEFAULT_RETENTION_DAYS = 30;

const AUTO_TYPES: Record<number, string> = {
    0: "Nenhuma",
    1: "Irrigação",
    2: "Climatização",
    3: "Aquecimento",
    4: "Nebulização",
    5: "Monitoramento",
    6: "Sombreamento Simples",
    7: "Sombreamento Avançado",
    8: "Cíclico",
    9: "Iluminação"
};

function normalizeTagKey(value: any): string {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function getTagValue(tags: any[] | undefined, key: string): string | undefined {
    const wanted = normalizeTagKey(key);
    const tag = (tags || []).find((item) => normalizeTagKey(item?.key) === wanted);
    if (tag?.value === undefined || tag?.value === null || tag?.value === "") return undefined;
    return String(tag.value);
}

function parseRetentionDays(value: any): number | null {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(String(value).replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
}

function getRetentionDaysFromTags(tags: any[] | undefined): number | null {
    return parseRetentionDays(
        getTagValue(tags, "plan_retention_days") ||
        getTagValue(tags, "custom_retention_days") ||
        getTagValue(tags, "retention_days") ||
        getTagValue(tags, "retencao_dias")
    );
}

async function resolveRetentionDays(account: Account, centralDevice: any, organizationId?: string): Promise<number> {
    const centralRetention = getRetentionDaysFromTags(centralDevice.tags);
    if (centralRetention) return centralRetention;

    if (organizationId) {
        try {
            const organizationDevice = await account.devices.info(organizationId);
            const organizationRetention = getRetentionDaysFromTags(organizationDevice.tags);
            if (organizationRetention) return organizationRetention;
        } catch (_) {
            // Algumas instalacoes ainda guardam organization_id como identificador logico, nao como ID do device.
        }
    }

    return DEFAULT_RETENTION_DAYS;
}

function parseAutoValue(value: any): number | null {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

interface SensorData {
    MOD: number;
    EN: boolean;
    RG: boolean;
    OBJ: string;
    LIM: string;
    TEMP?: string;
    HUM?: string;
    CON?: string;
    SAL?: string;
    TDS?: string;
    EPS?: string;
    PW?: string;
    SOL?: string;
    COMM?: number;
    Auto?: number | string;
    ERRO?: Record<string, number>;
    [key: string]: any;
}

interface UplinkMessage {
    SN: string;
    FWV: string;
    configDevice?: string;
    devId?: string;
    data: {
        status?: any;
        sens?: {
            [sensorNumber: string]: SensorData;
        };
        Time?: any;
        fert?: any;
        Out?: any;
    };
}

/**
 * Função principal que verifica se deve cadastrar sensores automaticamente
 * e executa o cadastro na TagoIO
 * 
 * @param messageData - Dados da mensagem MQTT recebida
 * @param connectorId - ID do connector TagoIO (opcional)
 * @param networkId - ID do network no connector (opcional, mesmo valor do connectorId geralmente)
 */
export async function autoRegisterSensors(
    messageData: any,
    connectorId?: string,
    networkId?: string
): Promise<void> {
    try {
        // Parse da mensagem se vier como string
        const data: UplinkMessage = typeof messageData === 'string'
            ? JSON.parse(messageData)
            : messageData;

        // Verifica se a flag configDevice está ativa
        if (data.configDevice !== "true") {
            console.debug("configDevice não está ativo, pulando autocadastro");
            return;
        }

        console.log(`🔧 Iniciando autocadastro de sensores para central ${data.SN}`);
        console.log(`🔌 Connector ID: ${connectorId || 'NÃO FORNECIDO'}`);
        console.log(`🌐 Network ID: ${networkId || 'NÃO FORNECIDO'}`);

        // Valida se há dados de sensores
        if (!data.data?.sens) {
            console.warn("Nenhum sensor encontrado na mensagem");
            return;
        }

        // Inicializa a conta TagoIO
        const account = new Account({ token: ACCOUNT_TOKEN });

        // Busca a central existente pelo serial number
        console.log(`🔍 Buscando central ${data.SN}...`);
        const centralDevices = await account.devices.list({
            page: 1,
            amount: 1,
            filter: {
                tags: [
                    { key: "serial_number", value: data.SN }
                ]
            }
        });

        if (centralDevices.length === 0) {
            throw new Error(`Central com serial number ${data.SN} não encontrada na TagoIO. Cadastre a central primeiro.`);
        }

        const centralDevice = centralDevices[0];
        console.log(`✅ Central encontrada: ${centralDevice.name} (ID: ${centralDevice.id})`);

        // Extrai group_id e organization_id das tags da central
        const groupId = getTagValue(centralDevice.tags, "group_id");
        const organizationId = getTagValue(centralDevice.tags, "organization_id");
        const retentionDays = await resolveRetentionDays(account, centralDevice, organizationId);

        if (!groupId) {
            console.warn(`⚠️ Tag 'group_id' não encontrada na central ${data.SN}`);
        }
        if (!organizationId) {
            console.warn(`⚠️ Tag 'organization_id' não encontrada na central ${data.SN}`);
        }

        console.log(`📋 group_id: ${groupId}, organization_id: ${organizationId}, retenção=${retentionDays} dias`);

        // Cadastra cada sensor individualmente
        const sensorNumbers = Object.keys(data.data.sens);
        let successCount = 0;
        let errorCount = 0;

        for (const sensorNumber of sensorNumbers) {
            const sensorConfig = data.data.sens[sensorNumber];
            const serialNumber = `${data.SN}_${sensorNumber}`;

            try {
                await registerSensorDevice(
                    account,
                    serialNumber,
                    data.SN,
                    sensorNumber,
                    sensorConfig,
                    groupId,
                    organizationId,
                    retentionDays,
                    connectorId,
                    networkId
                );
                successCount++;
                console.log(`✅ Sensor ${serialNumber} cadastrado com sucesso`);
            } catch (error) {
                errorCount++;
                console.error(`❌ Erro ao cadastrar sensor ${serialNumber}:`, error);
            }
        }

        console.log(`\n📊 Resumo do autocadastro:`);
        console.log(`   Central: ${data.SN}`);
        console.log(`   Total de sensores: ${sensorNumbers.length}`);
        console.log(`   Cadastrados: ${successCount}`);
        console.log(`   Erros: ${errorCount}`);

    } catch (error) {
        console.error("❌ Erro no processo de autocadastro:", error);
        throw error;
    }
}

/**
 * Cadastra um sensor na TagoIO usando API REST
 */
async function registerSensorDevice(
    account: Account,
    serialNumber: string,
    centralSN: string,
    sensorNumber: string,
    sensorConfig: SensorData,
    groupId?: string,
    organizationId?: string,
    retentionDays: number = DEFAULT_RETENTION_DAYS,
    connectorId?: string,
    networkId?: string
): Promise<void> {
    try {
        // Verifica se o sensor já existe
        console.log(`🔍 Verificando se sensor ${serialNumber} já existe...`);
        try {
            const listResponse = await account.devices.list({ 
                page: 1, 
                amount: 1,
                filter: {
                    tags: [{ key: "dev_eui", value: serialNumber }]
                }
            });
            console.log(`Resposta da verificação de existência do sensor ${serialNumber}:`, listResponse);
            if (listResponse && listResponse.length > 0) {
                console.log(`📡 Sensor ${serialNumber} já cadastrado`);
                return;
            }
        } catch (listError) {
            console.log(`⚠️ Erro ao verificar existência do sensor, continuando com criação...`);
        }

        const autoValue = parseAutoValue(sensorConfig.Auto ?? sensorConfig.auto);
        const autoLabel = autoValue !== null ? (AUTO_TYPES[autoValue] || `Auto ${autoValue}`) : "Não informado";
        const devMode = autoValue === 5 ? "monitoring" : "automation";

        // Define o tipo de sensor baseado no MOD
        let sensorType = "irrigation"; // padrão
        switch (sensorConfig.MOD) {
            case 0:
                sensorType = "irrigation";
                break;
            case 1:
                sensorType = "nutrition";
                break;
            case 2:
                sensorType = "nutrition_2";
                break;
            case 4:
                sensorType = "illumination";
                break;
            case 5:
                sensorType = "climate";
                break;
        }

        // Cria o dispositivo do sensor
        const deviceConfig: any = {
            name: `Sensor ${sensorNumber} - Central ${centralSN}`,
            type: "immutable",
            serie_number: serialNumber,
            connector: "669188217d61980008c18be1",
            network: "6686e259ffa21c0008faa296",
            chunk_period: "day",
            chunk_retention: retentionDays,
            tags: [
                { key: "dev_eui", value: serialNumber },
                { key: "central_sn", value: centralSN },
                { key: "sensor_number", value: sensorNumber },
                ...(groupId ? [{ key: "group_id", value: groupId }] : []),
                ...(organizationId ? [{ key: "organization_id", value: organizationId }] : []),
                { key: "plan_retention_days", value: String(retentionDays) },
                ...(autoValue !== null ? [{ key: "auto", value: String(autoValue) }] : []),
                { key: "auto_label", value: autoLabel },
                { key: "sensor", value: sensorType },
                { key: "device_type", value: "device" },
                { key: "dev_mode", value: devMode },
            ],

        };
        console.log(`Configuração do dispositivo para sensor ${serialNumber}:`, deviceConfig);
        try {

            const createResponse = await account.devices.create(deviceConfig);
            const deviceId = createResponse.device_id;
            console.log(`✅ Sensor ${serialNumber} cadastrado com ID: ${deviceId}`);

            // Adiciona tag device_id ao sensor recém-criado
            try {
                await account.devices.edit(deviceId, {
                    tags: [
                        ...deviceConfig.tags,
                        { key: "device_id", value: deviceId }
                    ]
                });
                console.log(`🏷️ Tag device_id adicionada ao sensor ${serialNumber}`);
            } catch (tagError) {
                console.warn(`⚠️ Erro ao adicionar tag device_id:`, tagError);
            }

            // Cria token de autorização para o sensor
            try {
                const deviceAuthToken = await account.ServiceAuthorization.tokenCreate({
                    name: `${serialNumber}_token`,
                    permission: "full"
                });

                console.log(`🔑 Token de autorização criado para sensor ${serialNumber}`);
            } catch (tokenError) {
                console.warn(`⚠️ Erro ao criar token de autorização:`, tokenError);
            }

            // Configura parâmetros adicionais do device
            try {
                await account.devices.paramSet(deviceId, { key: "dev_eui", value: serialNumber, sent: false });
                await account.devices.paramSet(deviceId, { key: "dev_lastcheckin", value: "-", sent: false });
                await account.devices.paramSet(deviceId, { key: "dev_battery", value: "-", sent: false });
            } catch (paramError) {
                console.warn(`⚠️ Erro ao configurar parâmetros adicionais:`, paramError);
            }

            // Configura o dashboard_url baseado no tipo de sensor
            try {
                const dashboardMap: { [key: string]: string } = {
                    'irrigation': 'irrigation',
                    'nutrition': 'nutrition',
                    'nutrition_2': 'nutrition_2',
                    'illumination': 'illumination',
                    'climate': 'climate'
                };

                const connectorType = dashboardMap[sensorType];
                if (connectorType) {
                    // Busca dashboard pelo connector_id (tipo de sensor)
                    const [dash] = await account.dashboards.list({
                        amount: 1,
                        fields: ["id", "tags"],
                        filter: {
                            tags: [{ key: "connector_id", value: connectorType }]
                        }
                    });

                    if (dash) {
                        const dashboardUrl = `https://admin.tago.io/dashboards/info/${dash.id}?org_dev=${organizationId}&group_dev=${groupId}&sensor=${deviceId}`;
                        
                        await account.devices.paramSet(deviceId, {
                            key: "dashboard_url",
                            value: dashboardUrl,
                            sent: false
                        });
                        
                        console.log(`📊 Dashboard URL configurado para sensor ${serialNumber}`);
                    } else {
                        console.warn(`⚠️ Dashboard não encontrado para tipo ${sensorType}`);
                    }
                }
            } catch (dashError) {
                console.warn(`⚠️ Erro ao configurar dashboard_url:`, dashError);
            }

        } catch (createError) {
            console.error(`❌ Erro ao criar sensor ${serialNumber}:`, createError);
            throw createError;
        }


    } catch (error) {
        console.error(`Erro ao cadastrar sensor ${serialNumber}:`, error);
        throw error;
    }
}

/**
 * Função auxiliar para validar se uma mensagem deve acionar o autocadastro
 */
export function shouldAutoRegister(data: any): boolean {
    try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return parsed.configDevice === "true" && parsed.data?.sens !== undefined;
    } catch (error) {
        return false;
    }
}
