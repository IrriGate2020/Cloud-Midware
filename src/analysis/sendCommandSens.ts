// Este código implementa uma função chamada `sendCommand`, que é utilizada em uma análise (Analysis) na plataforma TagoIO para enviar comandos via MQTT para um dispositivo conectado, usando dados fornecidos pelo contexto da análise. A função interage com os dados de entrada e envia uma mensagem ao dispositivo, solicitando a execução de um comando de controle ou configuração.

 // A função segue este fluxo:
 // 1. **Coleta de dados do contexto**: 
 //    - A função começa coletando informações do dispositivo e do contexto fornecido pela análise. As variáveis do escopo são extraídas e usadas para configurar a mensagem a ser enviada. Isso inclui informações como permissões de comando (`command_has_permision`), limites (`lim`), e configurações de tempo para "DMa" e "IMi".
 //    - A função também verifica o número de série do dispositivo (`dev_eui`), que é extraído e processado para determinar um índice.
 
 // 2. **Validação e processamento dos dados**:
 //    - A função valida o número de série (`serial_id`) e o índice extraído da string do número de série para garantir que ele seja válido.
 //    - Os valores para as variáveis de comando, como permissões, limites, e horários, são convertidos para números ou padrões apropriados caso não sejam encontrados.

 // 3. **Configuração do MQTT**:
 //    - A função cria um cliente MQTT utilizando o URL do broker configurado (`mqtt://34.67.184.199:1883`) e um `clientId` específico.
 //    - O cliente se conecta ao broker e, ao ser conectado, prepara uma mensagem no formato JSON, contendo o número de série do dispositivo (`SN`) e os dados que representam o comando a ser enviado. A mensagem inclui várias configurações relacionadas ao dispositivo, como permissões, limites e horários.

 // 4. **Publicação da mensagem MQTT**:
 //    - A mensagem preparada é publicada no tópico "downlink" usando o método `publish` do cliente MQTT. Caso a publicação seja bem-sucedida, a conexão MQTT é encerrada. Caso contrário, um erro de publicação é registrado no console.

 // 5. **Tratamento de erros**:
 //    - Caso ocorra algum erro de conexão MQTT, a função registra o erro no console para permitir a depuração.

import { Analysis, Resources } from "@tago-io/sdk";
import { Data, TagoContext } from "@tago-io/sdk/lib/types";
import mqtt from 'mqtt';
// Configurações do broker
const brokerUrl = 'mqtt://34.67.184.199:1883';
const clientId = 'publisher-client';


async function sendCommand(context: TagoContext, scope: Data[]) {
    console.log("Running Analysis");
    const device = scope[0].device;
    const token = context.token;
    const resources = new Resources({ token: token })
    const device_info = await resources.devices.info(device);
    const serial_id = device_info.tags.find((x) => x.key === "dev_eui")?.value;
    const splitted = serial_id?.split("_"); 
    if (!splitted) {
        throw new Error("Serial Number not found!");
    }
    const index = Number(splitted[1]);
    if (isNaN(index)) {
        throw new Error("Invalid number in serial number!");
    }
    const command_has_permision = scope.find((x) => x.variable === "command_has_permision")?.value || 1;
    const lim = scope.find((x) => x.variable === "lim")?.value || 0;
    const obj = scope.find((x) => x.variable === "obj")?.value || 0;

    const dmami = scope.find((x) => x.variable === "dmami")?.value;
    const DMaHh = String(dmami).split(":")[0];
    const DMaMi = String(dmami).split(":")[1];
    const imimi = scope.find((x) => x.variable === "imimi")?.value;
    const IMiHh = String(imimi).split(":")[0];
    const IMiMi = String(imimi).split(":")[1];


    // Cria o cliente MQTT
    const client = mqtt.connect(brokerUrl, { clientId });

    client.on('connect', () => {
        console.log(`Cliente ${clientId} conectado ao broker.`);
        // Publica uma mensagem no tópico "downlink"
        const message = {
            "SN": splitted[0],
            "data": {
                "sens": {
                    [String(index)]: {
                        "EN": Number(command_has_permision),
                        "OBJ": Number(obj),
                        "LIM": Number(lim),
                        "DMaHh": Number(DMaHh) || 0,
                        "DMaMi": Number(DMaMi) || 0,
                        "IMiHh": Number(IMiHh) || 0,
                        "IMiMi": Number(IMiMi) || 0,
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
export default new Analysis(sendCommand, { token: "a-acc2e867-3e7c-4a8c-991a-c823853aa545" });
