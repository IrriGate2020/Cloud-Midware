import { Analysis, Resources } from "@tago-io/sdk"; ''
import { Data, TagoContext } from "@tago-io/sdk/lib/types";
import { time } from "console";
import mqtt from 'mqtt';
// Configurações do broker
const brokerUrl = 'mqtt://34.67.184.199:1883';
const clientId = 'publisher-client';

async function sendCommand(context: TagoContext, scope: Data[]) {
    console.log("Running Analysis");
    console.log(scope);
    const output_select = scope.find((x) => x.variable === "output_select")?.value;
    const output_status = scope.find((x) => x.variable === "output_status")?.value;
    const output_time = scope.find((x) => x.variable === "output_time")?.value;
    if(!output_time){
        return;
    }
    const time_splitted = String(output_time).split(":");
    const array_time = [Number(time_splitted[0]),Number(time_splitted[1])];
    const group = scope[0].device;
    const token = context.token;
    const resources = new Resources({ token: token })
    const device_info = await resources.devices.info(group);
    const serial_id = device_info.tags.find((x) => x.key === "serial_number")?.value;
    const client = mqtt.connect(brokerUrl, { clientId });
    client.on('connect', () => {
        console.log(`Cliente ${clientId} conectado ao broker.`);
        // Publica uma mensagem no tópico "downlink"
        const message = {
            "SN": serial_id,
            "data": {
                "Out": {
                    "output": output_select,
                    "status": output_status,
                    "outTime": array_time,
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
export default new Analysis(sendCommand, { token: "a-84094b8e-b781-49ef-90f9-c505ad3978a4" });
