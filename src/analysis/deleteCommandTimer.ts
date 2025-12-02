/*
  Este código é uma implementação de uma análise (Analysis) na plataforma TagoIO que envia um comando via MQTT para um dispositivo, deletando dados específicos e publicando informações sobre o tempo de um "timer" no broker MQTT.

  A função `sendCommand` segue o seguinte fluxo:

  1. **Coleta de variáveis do ambiente**:
     - A função utiliza a biblioteca `Utils` do TagoIO para converter as variáveis de ambiente em um objeto JSON. 
     - Verifica se a variável `account_token` está presente nas variáveis de ambiente. Caso contrário, lança um erro indicando que a variável está ausente.

  2. **Coleta de dados do contexto**:
     - A função coleta informações do dispositivo a partir do `device_id` obtido do escopo e do token do contexto.
     - Utiliza a API do TagoIO para interagir com o dispositivo e excluir dados específicos com base no `group` e `time` presentes no escopo.

  3. **Exclusão de dados do dispositivo**:
     - Para cada dado presente no escopo, a função chama o método `deleteData` para excluir dados do dispositivo com o grupo e o tempo específicos.

  4. **Coleta das informações do dispositivo**:
     - A função usa o recurso de `Resources` da SDK do TagoIO para obter informações detalhadas sobre o dispositivo, incluindo o número de série (serial number) do dispositivo.

  5. **Configuração do MQTT**:
     - A função cria um cliente MQTT, configurado com um `clientId` único, e se conecta ao broker MQTT especificado.
     - A função prepara uma mensagem JSON que contém o número de série do dispositivo e o valor de `timer_number` (tempo do timer) coletado no escopo.

  6. **Publicação da mensagem MQTT**:
     - Após a conexão bem-sucedida com o broker, a função publica a mensagem no tópico "downlink".
     - A mensagem inclui o número de série do dispositivo e o valor do timer, que será usado para indicar o tempo de algum processo ou operação no dispositivo.

  7. **Tratamento de erros**:
     - Caso ocorra algum erro durante a conexão com o broker ou ao tentar publicar a mensagem, o erro é registrado no console.
     - A conexão com o broker é encerrada após a publicação ou em caso de erro.
*/


import { Account, Analysis, Resources, Utils } from "@tago-io/sdk";
import { Data, TagoContext } from "@tago-io/sdk/lib/types";
import mqtt from 'mqtt';
// Configurações do broker
const brokerUrl = 'mqtt://34.58.177.51:1883';
const clientId = 'publisher-client';

async function sendCommand(context: TagoContext, scope: Data[]) {
    console.log("Running Analysis");
    console.log(scope);
    const environment = Utils.envToJson(context.environment);
    if (!environment) {
        return;
    } else if (!environment.account_token) {
        throw "Missing account_token environment var";
    }
    const account = new Account({ token: environment.account_token });
    const device_id = scope[0].device;
    const token = context.token;
    const resources = new Resources({ token: token });
    for (const data of scope) {
        console.log(data.id);
        console.log(data.group);
        const device = await Utils.getDevice(account, device_id);
        const dataDeleted = await device.deleteData({ groups: data.group, qty: 9999 });
        console.debug(dataDeleted);
    }
    const device_info = await resources.devices.info(device_id);
    const serial_id = device_info.tags.find((x) => x.key === "serial_number")?.value;
    const timer_number = scope.find((x) => x.variable === "timer_number")?.value;
    const client = mqtt.connect(brokerUrl, { clientId });
    client.on('connect', () => {
        console.log(`Cliente ${clientId} conectado ao broker.`);
        // Publica uma mensagem no tópico "downlink"
        const message = {
            "SN": serial_id,
            "data": {
                "DEL_TIME": Number(timer_number),
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

    return;

}

export { sendCommand };
export default new Analysis(sendCommand, { token: "a-541de983-d337-4dd5-bb0c-74801ebf61fc" });
