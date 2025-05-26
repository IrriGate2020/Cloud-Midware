// Este código é uma implementação de uma análise (Analysis) na plataforma TagoIO que envia comandos via MQTT para um dispositivo, controlando a ativação de uma saída dependendo de um "gatilho manual" (manual_trigger). A função `sendCommand` é chamada sempre que a análise é executada, e a tarefa principal é publicar uma mensagem no tópico "downlink" do broker MQTT, informando o status de uma saída do dispositivo.

 // A função segue o seguinte fluxo:
 // 1. **Coleta de dados do contexto**:
 //    - O primeiro passo é extrair o valor da variável `manual_trigger` do escopo fornecido pela análise. Se essa variável estiver presente e for verdadeira, ela define que o status da saída será 1 (ativada). Caso contrário, o status será 0 (desativada).
 //    - Em seguida, a função coleta o grupo (dispositivo) do primeiro item do escopo e usa o token do contexto para obter informações sobre o dispositivo através da API TagoIO.
 
 // 2. **Processamento do número de série**:
 //    - A partir das informações do dispositivo, a função encontra o número de série (chave "dev_eui") e o divide em partes, onde o primeiro elemento é considerado o número de série principal e o segundo elemento é usado como um índice.

 // 3. **Configuração do MQTT**:
 //    - A função cria um cliente MQTT que se conecta ao broker especificado no código (`mqtt://34.67.184.199:1883`), utilizando um `clientId` específico.
 //    - Quando o cliente se conecta com sucesso ao broker, ele publica uma mensagem no tópico "downlink". A mensagem inclui o número de série do dispositivo e o status da saída, que pode ser 0 ou 1 dependendo do valor de `manual_trigger`.

 // 4. **Publicação de dados MQTT**:
 //    - A mensagem é criada no formato JSON, incluindo a chave "Out" com o índice da saída e seu status. Em seguida, a função tenta publicar essa mensagem no tópico "downlink" do broker MQTT.
 //    - Se a publicação for bem-sucedida, a função encerra a conexão com o broker.

 // 5. **Tratamento de erros**:
 //    - Caso haja um erro ao conectar ao broker ou ao tentar publicar a mensagem, a função registra o erro no console.

import { Analysis, Resources } from "@tago-io/sdk";''
import { Data, TagoContext } from "@tago-io/sdk/lib/types";
import mqtt from 'mqtt';
// Configurações do broker
const brokerUrl = 'mqtt://34.58.177.51:1883';
const clientId = 'publisher-client';

async function sendCommand(context: TagoContext, scope: Data[]) {
    console.log("Running Analysis");
    console.log(scope);
    let status = 0;
    const manual_trigger = scope.find((x) => x.variable === "manual_trigger")?.value
    if(manual_trigger){
        status = 1;
    }
    const group = scope[0].device;
    const token = context.token;
    const resources = new Resources({ token: token })
    const device_info = await resources.devices.info(group);
    const serial_id = device_info.tags.find((x) => x.key === "dev_eui")?.value;
    const splitted = serial_id?.split("_");
    if (!splitted) {
        throw new Error("Serial Number not found!");
    }
    const index = Number(splitted[1]);
    const client = mqtt.connect(brokerUrl, { clientId });
    client.on('connect', () => {
        console.log(`Cliente ${clientId} conectado ao broker.`);
        // Publica uma mensagem no tópico "downlink"
        const message = {
            "SN": splitted[0],
            "data": {
                "Out": {
                    "output": index,
                    "status": status
                }
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
export default new Analysis(sendCommand, { token: "a-ae52c000-e782-427f-a5b2-5e0bdcb8c673" });
