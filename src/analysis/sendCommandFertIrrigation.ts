/*
  Este código é uma implementação de uma análise (Analysis) na plataforma TagoIO, que envia comandos via MQTT para um dispositivo, controlando soluções de fertilização (A a F). A função `sendCommand` é chamada sempre que a análise é executada e a tarefa principal é publicar uma mensagem no tópico "downlink" do broker MQTT, informando o estado e a duração das soluções de fertilização.

  A função segue o seguinte fluxo:

  1. **Coleta de dados do contexto**:
     - A função extrai as variáveis de solução (A a F) e as respectivas durações (`duration_a`, `duration_b`, ..., `duration_f`) do escopo fornecido pela análise.
     - Para cada solução, verifica se está ativa (booleano) e divide a duração fornecida no formato `MM:SS`, separando em minutos e segundos.
     - A função também coleta o dispositivo (grupo) e usa o token do contexto para obter informações do dispositivo via API TagoIO.

  2. **Processamento do número de série**:
     - O número de série do dispositivo (chave "dev_eui") é recuperado e dividido, sendo o primeiro item utilizado como o identificador principal do dispositivo.

  3. **Criação do objeto de configuração**:
     - Para cada solução de fertilização (A a F), a função cria um objeto `fert` que contém as informações sobre o estado (ativado/desativado) e a duração (minutos e segundos) de cada solução.

  4. **Configuração do MQTT**:
     - Um cliente MQTT é criado e configurado com um `clientId` único, conectando-se ao broker MQTT especificado.
     - Após a conexão bem-sucedida, a função publica uma mensagem no tópico "downlink", incluindo o número de série do dispositivo e as configurações das soluções de fertilização.

  5. **Publicação de dados MQTT**:
     - A mensagem é formatada em JSON e enviada para o broker MQTT no tópico "downlink". A função tenta publicar a mensagem com as informações das soluções de fertilização.
     - Caso a publicação seja bem-sucedida, a conexão com o broker é encerrada.

  6. **Tratamento de erros**:
     - Em caso de erro ao conectar ao broker ou ao publicar a mensagem, o erro é registrado no console e a conexão com o broker é encerrada de maneira segura.

  Esse fluxo permite o controle remoto das soluções de fertilização, configurando-as dinamicamente com base nas variáveis definidas pela análise.
*/


import { Analysis, Resources } from "@tago-io/sdk"; ''
import { Data, TagoContext } from "@tago-io/sdk/lib/types";
import { time } from "console";
import mqtt from 'mqtt';
// Configurações do broker
const brokerUrl = 'mqtt://34.67.184.199:1883';
const clientId = 'publisher-client';


async function sendCommand(context: TagoContext, scope: Data[]) {
    console.log("Running Analysis");

    const group = scope[0].device;
    const token = context.token;
    const resources = new Resources({ token: token })
    const device_info = await resources.devices.info(group);
    console.log(device_info);
    const serial_id = device_info.tags.find((x) => x.key === "dev_eui")?.value.split("_")[0];


    const soluction_a = scope.find((x) => x.variable === "soluction_a")?.value;
    const duration_a = scope.find((x) => x.variable === "duration_a")?.value;
    const time_splittedA = String(duration_a).split(":");

    interface DataType {
        EN: boolean;
        DSec: string | number;
        DMin: string | number;
    }

    const fert: { [key: string]: DataType } = {};

    if (soluction_a === true) {

        fert["A"] = {
            "EN": true,
            "DSec": time_splittedA[1],
            "DMin": time_splittedA[0]
        }
    } else if (soluction_a === false && time_splittedA[0] !== "undefined") {

        fert["A"] = {
            "EN": false,
            "DSec": time_splittedA[1] || 0,
            "DMin": time_splittedA[0] || 0,
        }
    }

    const soluction_b = scope.find((x) => x.variable === "soluction_b")?.value;
    const duration_b = scope.find((x) => x.variable === "duration_b")?.value;
    const time_splittedB = String(duration_b).split(":");

    if (soluction_b === true) {

        fert["B"] = {
            "EN": true,
            "DSec": time_splittedB[1],
            "DMin": time_splittedB[0]
        }
    } else if (soluction_b === false && time_splittedB[0] !== "undefined") {

        fert["B"] = {
            "EN": false,
            "DSec": time_splittedB[1] || 0,
            "DMin": time_splittedB[0] || 0,
        }
    }

    const soluction_c = scope.find((x) => x.variable === "soluction_c")?.value;
    const duration_c = scope.find((x) => x.variable === "duration_c")?.value;
    const time_splittedC = String(duration_c).split(":");

    if (soluction_c === true) {

        fert["C"] = {
            "EN": true,
            "DSec": time_splittedC[1],
            "DMin": time_splittedC[0]
        }
    } else if (soluction_c === false && time_splittedC[0] !== "undefined") {

        fert["C"] = {
            "EN": false,
            "DSec": time_splittedC[1] || 0,
            "DMin": time_splittedC[0] || 0,
        }
    }



    const soluction_d = scope.find((x) => x.variable === "soluction_d")?.value;
    const duration_d = scope.find((x) => x.variable === "duration_d")?.value;
    const time_splittedD = String(duration_d).split(":");

    if (soluction_d === true) {

        fert["D"] = {
            "EN": true,
            "DSec": time_splittedD[1],
            "DMin": time_splittedD[0]
        }
    } else if (soluction_d === false && time_splittedD[0] !== "undefined") {

        fert["D"] = {
            "EN": false,
            "DSec": time_splittedD[1] || 0,
            "DMin": time_splittedD[0] || 0,
        }
    }


    const soluction_e = scope.find((x) => x.variable === "soluction_e")?.value;
    const duration_e = scope.find((x) => x.variable === "duration_e")?.value;
    const time_splittedE = String(duration_e).split(":");

    if (soluction_e === true) {

        fert["E"] = {
            "EN": true,
            "DSec": time_splittedE[1],
            "DMin": time_splittedE[0]
        }
    } else if (soluction_e === false && time_splittedE[0] !== "undefined") {

        fert["E"] = {
            "EN": false,
            "DSec": time_splittedE[1] || 0,
            "DMin": time_splittedE[0] || 0,
        }
    }


    const soluction_f = scope.find((x) => x.variable === "soluction_f")?.value;
    const duration_f = scope.find((x) => x.variable === "duration_f")?.value;
    const time_splittedF = String(duration_f).split(":");

    if (soluction_f === true) {

        fert["F"] = {
            "EN": true,
            "DSec": time_splittedF[1],
            "DMin": time_splittedF[0]
        }
    } else if (soluction_f === false && time_splittedF[0] !== "undefined") {

        fert["F"] = {
            "EN": false,
            "DSec": time_splittedF[1] || 0,
            "DMin": time_splittedF[0] || 0,
        }
    }
    const client = mqtt.connect(brokerUrl, { clientId });
        client.on('connect', () => {
            console.log(`Cliente ${clientId} conectado ao broker.`);
            // Publica uma mensagem no tópico "downlink"
            const message = {
                "SN": serial_id,
                "data": {
                    "fert": fert
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
export default new Analysis(sendCommand, { token: "a-cadf7491-12fb-4a73-8eec-80541da45f14" });
