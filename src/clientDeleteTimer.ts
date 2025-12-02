// Este código implementa um cliente MQTT que se conecta a um broker remoto e se inscreve em um tópico específico para receber mensagens. A funcionalidade principal é escutar por mensagens publicadas no tópico "uplink" e, ao receber uma mensagem, enviá-la para TagoIO

// O broker MQTT é acessado usando a URL fornecida ('mqtt://34.67.184.199:1883'), e o cliente MQTT é criado com a biblioteca 'mqtt'.
// O evento 'connect' é disparado quando a conexão com o broker é bem-sucedida, e o cliente se inscreve no tópico "uplink" para receber mensagens publicadas nesse tópico.
// O evento 'message' é disparado sempre que uma mensagem é recebida no tópico ao qual o cliente está inscrito. A mensagem é registrada no console e, em seguida, é enviada para o serviço externo utilizando a função 'sendDataToTago'.
// O evento 'error' trata qualquer erro de conexão, mostrando uma mensagem de erro no console.

import mqtt from 'mqtt';
import { Device } from '@tago-io/sdk';

const tago_server_udp = require('./middleware/tago_udp_access');

const brokerUrl = 'mqtt://34.58.177.51:1883';
const topic = 'uplink';

// Conectando ao broker
const client = mqtt.connect(brokerUrl);

// Evento quando a conexão é estabelecida
client.on('connect', () => {
    console.log('Conectado ao broker MQTT');
    // Inscrevendo-se no tópico "uplink"
    client.subscribe(topic, (err) => {
        if (err) {
            console.error(`Erro ao se inscrever no tópico ${topic}:`, err);
        } else {
            console.log(`Inscrito no tópico: ${topic}`);
        }
    });
});

// Evento quando uma mensagem é recebida
client.on('message', async (topic, message) => {
    console.log(`Mensagem recebida no tópico ${topic}: ${message.toString()}`);

    let parsed: any;
    try {
        parsed = JSON.parse(message.toString());
    } catch (error) {
        console.error('Mensagem MQTT não é um JSON válido:', error);
        return;
    }

    const serialNumber = parsed?.SN;
    const timeBlock = parsed?.data?.Time;

    if (!serialNumber || !timeBlock || !Array.isArray(timeBlock.Active)) {
        console.log('Mensagem não é de delete de timer no formato esperado, ignorando.');
        return;
    }

    try {
        // Primeiro, obtém o token e informações do device encontrado pelo serialNumber
        const mainDeviceToken = await tago_server_udp
            .get_token(serialNumber)
            .catch((e: any) => {
                console.error(e);
            });

 

        if (!mainDeviceToken) {
            console.debug(`Dispositivo não encontrado com o serial: ${serialNumber}`);
            return;
        }

        const mainDevice = new Device({ token: mainDeviceToken });

        // Pega as infos do device principal para descobrir o device que guarda o timer
        const mainInfo = await mainDevice.info().catch(() => undefined);
        console.log(mainInfo)

        // Como não temos o ID diretamente, usamos o helper do servidor UDP se existir
        let timerDeviceID: string | undefined;

        if (mainInfo && Array.isArray(mainInfo.tags)) {
            const groupTag = mainInfo.tags.find((t: any) => t.key === 'group_id');
            timerDeviceID = groupTag?.value;
        }

        if (!timerDeviceID) {
            console.log(`Tag group_id não encontrada para o dispositivo com serial ${serialNumber}`);
            return;
        }

        const timerDevice = mainDevice;

        // Mapeia todos os índices do Active que estão com 0 para seus timer_number (index+1)
        const activeArray: number[] = timeBlock.Active;
        const timersToDelete: number[] = [];

        activeArray.forEach((value, index) => {
            if (value === 0) {
                const timerNumber = index + 1; // Active[0] -> timer_number 1
                timersToDelete.push(timerNumber);
            }
        });

        if (!timersToDelete.length) {
            console.log('Nenhum timer com valor 0 em Active para deletar.');
            return;
        }

        console.log(`Timers a serem verificados para deleção: ${timersToDelete.join(', ')}`);

        for (const timerNumber of timersToDelete) {
            const oldData = await timerDevice.getData({
                variables: 'timer_number',
                values: `${timerNumber}`,
            });

            if (!oldData.length) {
                console.log(`Nenhum dado encontrado para timer_number=${timerNumber} no device de timer ${timerDeviceID}`);
                continue;
            }

            const groupsToDelete = Array.from(new Set(oldData.map((d: any) => d.group)));

            for (const group of groupsToDelete) {
                console.log(`Deletando dados do grupo ${group} (timer_number=${timerNumber}) do dispositivo de timer ${timerDeviceID}`);
                await timerDevice
                    .deleteData({ groups: group, qty: 9999 })
                    .then(console.log)
                    .catch(console.error);
            }
        }
    } catch (err) {
        console.error('Erro ao processar deleção de timer na Tago:', err);
    }
});

// Evento de erro
client.on('error', (error) => {
    console.error('Erro de conexão:', error);
});