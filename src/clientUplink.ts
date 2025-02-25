// Este código implementa um cliente MQTT que se conecta a um broker remoto e se inscreve em um tópico específico para receber mensagens. A funcionalidade principal é escutar por mensagens publicadas no tópico "uplink" e, ao receber uma mensagem, enviá-la para TagoIO

// O broker MQTT é acessado usando a URL fornecida ('mqtt://34.67.184.199:1883'), e o cliente MQTT é criado com a biblioteca 'mqtt'.
// O evento 'connect' é disparado quando a conexão com o broker é bem-sucedida, e o cliente se inscreve no tópico "uplink" para receber mensagens publicadas nesse tópico.
// O evento 'message' é disparado sempre que uma mensagem é recebida no tópico ao qual o cliente está inscrito. A mensagem é registrada no console e, em seguida, é enviada para o serviço externo utilizando a função 'sendDataToTago'.
// O evento 'error' trata qualquer erro de conexão, mostrando uma mensagem de erro no console.


import mqtt from 'mqtt';
import { sendDataToTago } from './function/sendDataToTago';

const brokerUrl = 'mqtt://34.67.184.199:1883'; 
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
client.on('message', (topic, message) => {
    console.log(`Mensagem recebida no tópico ${topic}: ${message.toString()}`);
    sendDataToTago(message);
});

// Evento de erro
client.on('error', (error) => {
    console.error('Erro de conexão:', error);
});
