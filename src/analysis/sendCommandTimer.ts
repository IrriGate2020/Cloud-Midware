// Este código implementa uma função chamada `sendCommand`, que é usada para processar e enviar comandos de irrigação para dispositivos conectados à plataforma TagoIO via MQTT. A função é chamada em uma análise (Analysis) dentro da plataforma TagoIO e interage com dados contextuais fornecidos pelo TagoIO SDK.

// O objetivo da função é coletar várias variáveis de configuração (como "enable", "irrigation_hour", e os dias da semana) e enviar um comando MQTT para um dispositivo, configurando a operação de irrigação (ativação de saídas, duração de cada operação, e o horário de início da irrigação).

// O fluxo do código é o seguinte:
// 1. **Coleta de dados do escopo**: A função começa coletando dados de variáveis passadas para o contexto, como os dias da semana, a hora de irrigação, as saídas ativadas, e a duração para cada uma das saídas. Ela também prepara um array de configurações semanais, convertendo valores booleanos para 1 ou 0, e também os tempos de duração (minutos e segundos) para cada saída.
  
// 2. **Configuração do MQTT**: O código configura um cliente MQTT com as informações do broker fornecidas (o IP e a porta do broker MQTT). Ele se conecta ao broker e, uma vez conectado, prepara uma mensagem que será publicada no tópico "downlink".

// 3. **Estrutura da mensagem**: A mensagem publicada contém informações como o número de série do dispositivo (`SN`), o número do timer, as saídas ativadas, os horários de irrigação e as durações. A mensagem é construída com base nas variáveis de configuração coletadas anteriormente e em um formato específico para ser entendida pelo dispositivo.

// 4. **Publicação MQTT**: O cliente MQTT publica a mensagem no tópico "downlink". Se a publicação for bem-sucedida, o cliente encerra a conexão; caso contrário, exibe um erro de publicação no console.

// 5. **Tratamento de erros**: Em caso de falha na conexão MQTT, a função imprime um erro detalhado no console para facilitar a depuração.

import { Analysis, Resources } from "@tago-io/sdk";
import { Data, TagoContext } from "@tago-io/sdk/lib/types";
import mqtt from 'mqtt';
// Configurações do broker
const brokerUrl = 'mqtt://34.58.177.51:1883';
const clientId = 'publisher-client';


async function sendCommand(context: TagoContext, scope: Data[]) {
    console.log("Running Analysis");
    const group = scope[0].device;
    const token = context.token;
    const resources = new Resources({ token: token })
    const group_info = await resources.devices.info(group);
    const serial_id = group_info.tags.find((x) => x.key === "serial_number")?.value;
    const timer_number = scope.find((x) => x.variable === "timer_number")?.value;
    const enable = scope.find((x) => x.variable === "enable")?.value;
    const irrigation_hour = scope.find((x) => x.variable === "irrigation_hour")?.value;
    const trueOutputs = [] as any;
    for (let i = 1; i <= 32; i++) {
        const output = scope.find((x) => x.variable === `output${i}`)?.value;
        if (output !== true) {
            continue;
        }
        trueOutputs.push(i);
    }

    const minutesArray = [] as number[];
    const secondsArray = [] as number[];

    for (let i = 1; i <= 32; i++) {
        const duration = scope.find((x) => x.variable === `duration_${i}`)?.value as any;
        const output = scope.find((x) => x.variable === `output${i}`)?.value;
        if (!duration || !/^(\d{2}):(\d{2})$/.test(duration) || !output) {
            continue;
        }

        const [minutes, seconds] = duration.split(':').map(Number);
        minutesArray.push(minutes);
        secondsArray.push(seconds);
    }
    const segunda = scope.find((x) => x.variable === "segunda")?.value;
    const terca = scope.find((x) => x.variable === "terca")?.value;
    const quarta = scope.find((x) => x.variable === "quarta")?.value;
    const quinta = scope.find((x) => x.variable === "quinta")?.value;
    const sexta = scope.find((x) => x.variable === "sexta")?.value;
    const sabado = scope.find((x) => x.variable === "sabado")?.value;
    const domingo = scope.find((x) => x.variable === "domingo")?.value;
    const array_sem = [] as any;
    if (domingo === true) {
        array_sem.push(1);
    } else {
        array_sem.push(0);
    }
    if (segunda === true) {
        array_sem.push(1);
    } else {
        array_sem.push(0);
    }
    if (terca === true) {
        array_sem.push(1);
    } else {
        array_sem.push(0);
    }
    if (quarta === true) {
        array_sem.push(1);
    } else {
        array_sem.push(0);
    }
    if (quinta === true) {
        array_sem.push(1);
    } else {
        array_sem.push(0);
    }
    if (sexta === true) {
        array_sem.push(1);
    } else {
        array_sem.push(0);
    }
    if (sabado === true) {
        array_sem.push(1);
    } else {
        array_sem.push(0);
    }

    const irrigation_hour_splitted = String(irrigation_hour).split(":");
    // Cria o cliente MQTT
    const client = mqtt.connect(brokerUrl, { clientId });

    client.on('connect', () => {
        console.log(`Cliente ${clientId} conectado ao broker.`);
        // Publica uma mensagem no tópico "downlink"
        const message = {
            "SN": serial_id,
            "data": {
                "Time": {
                    [String(timer_number)]: {
                        "EN": Number(enable),
                        "sem": array_sem,
                        "HhIni": Number(irrigation_hour_splitted[0]),
                        "MinIni": Number(irrigation_hour_splitted[1]),
                        "ArrSecDu": secondsArray,
                        "ArrMinDu": minutesArray,
                        "SET": trueOutputs,
                    },
                },
            }
        };
        console.log(JSON.stringify(message));
        client.publish('downlink', JSON.stringify(message), {}, (err) => {
            if (err) {
                console.error('Erro ao publicar:', err);
            } else {
                console.log(`Mensagem publicada no tópico "downlink": ${message}`);
            }
            client.end(); // Encerra a conexão após publicar
        });
    });

    client.on('error', (err) => {
        console.error('Erro de conexão:', err);
    });


}

export { sendCommand };
export default new Analysis(sendCommand, { token: "a-d739f6ca-2ecf-4487-b389-4d33411da0ac" });