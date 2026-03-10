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

import { Account, Resources } from "@tago-io/sdk";
import axios from "axios";

// Token da conta TagoIO com permissões para criar dispositivos
// Este token deve ser configurado como variável de ambiente
const ACCOUNT_TOKEN = "ff300c89-19a5-4446-9571-f276837dee18";

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
    ERRO?: number;
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
        const resources = new Resources({ token: ACCOUNT_TOKEN });

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
        const groupId = centralDevice.tags?.find((tag: any) => tag.key === "group_id")?.value;
        const organizationId = centralDevice.tags?.find((tag: any) => tag.key === "organization_id")?.value;

        if (!groupId) {
            console.warn(`⚠️ Tag 'group_id' não encontrada na central ${data.SN}`);
        }
        if (!organizationId) {
            console.warn(`⚠️ Tag 'organization_id' não encontrada na central ${data.SN}`);
        }

        console.log(`📋 group_id: ${groupId}, organization_id: ${organizationId}`);

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
    connectorId?: string,
    networkId?: string
): Promise<void> {
    try {
        // Verifica se o sensor já existe usando API REST
        console.log(`🔍 Verificando se sensor ${serialNumber} já existe...`);
        try {
            const listResponse = await account.devices.list({ serial: serialNumber, amount: 1 });
            console.log(`Resposta da verificação de existência do sensor ${serialNumber}:`, listResponse);
            if (listResponse && listResponse.length > 0) {
                console.log(`📡 Sensor ${serialNumber} já cadastrado`);
                return;
            }
        } catch (listError) {
            console.log(`⚠️ Erro ao verificar existência do sensor, continuando com criação...`);
        }

        // Cria o dispositivo do sensor
        const deviceConfig: any = {
            name: `Sensor ${sensorNumber} - Central ${centralSN}`,
            type: "immutable",
            connector: "669188217d61980008c18be1",
            network: "6686e259ffa21c0008faa296",
            chunk_period: "day",
            chunk_retention: 7,
            tags: [
                { key: "serial_number", value: serialNumber },
                { key: "central_sn", value: centralSN },
                { key: "sensor_number", value: sensorNumber },
                ...(groupId ? [{ key: "group_id", value: groupId }] : []),
                ...(organizationId ? [{ key: "organization_id", value: organizationId }] : []),
                { key: "sensor", value: "irrigation" },
                { key: "device_type", value: "device" },
                { key: "dev_mode", value: "automation" },
            ],

        };
        console.log(`Configuração do dispositivo para sensor ${serialNumber}:`, deviceConfig);
        try {

            const createResponse = await account.devices.create(deviceConfig);
            const deviceId = createResponse.device_id;
            console.log(`✅ Sensor ${serialNumber} cadastrado com ID: ${deviceId}`);
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
