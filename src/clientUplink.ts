// Este código implementa um cliente MQTT que se conecta a um broker remoto e se inscreve em um tópico específico para receber mensagens. A funcionalidade principal é escutar por mensagens publicadas no tópico "uplink" e, ao receber uma mensagem, enviá-la para TagoIO

// O broker MQTT é acessado usando a URL fornecida ('mqtt://34.67.184.199:1883'), e o cliente MQTT é criado com a biblioteca 'mqtt'.
// O evento 'connect' é disparado quando a conexão com o broker é bem-sucedida, e o cliente se inscreve no tópico "uplink" para receber mensagens publicadas nesse tópico.
// O evento 'message' é disparado sempre que uma mensagem é recebida no tópico ao qual o cliente está inscrito. A mensagem é registrada no console e, em seguida, é enviada para o serviço externo utilizando a função 'sendDataToTago'.
// O evento 'error' trata qualquer erro de conexão, mostrando uma mensagem de erro no console.

// Carrega variáveis de ambiente do arquivo .env (se existir)
import 'dotenv/config';

import mqtt from 'mqtt';
import { sendDataToTago } from './function/sendDataToTago';
import { autoRegisterSensors, shouldAutoRegister } from './function/autoRegisterSensors';

const brokerUrl = 'mqtt://34.58.177.51:1883'; 
const topic = 'uplink'; 

// Configurações para autocadastro - FORNEÇA ESSES VALORES no arquivo .env
const CONNECTOR_ID = process.env.TAGO_CONNECTOR_ID || '669188217d61980008c18be1'; 
const NETWORK_ID = process.env.TAGO_NETWORK_ID || '6686e259ffa21c0008faa296';

console.log('🔧 Configuração do autocadastro:');
console.log('   CONNECTOR_ID:', CONNECTOR_ID || 'NÃO CONFIGURADO');
console.log('   NETWORK_ID:', NETWORK_ID || 'NÃO CONFIGURADO');

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
    
    const messageStr = message.toString();
    console.log('🔍 Verificando se deve fazer autocadastro...');
    console.log('shouldAutoRegister:', shouldAutoRegister(messageStr));
    
    // Verifica se deve fazer autocadastro de sensores
    if (shouldAutoRegister(messageStr)) {
        console.log('🔧 Detectado configDevice=true, iniciando autocadastro...');
        try {
            await autoRegisterSensors(messageStr, CONNECTOR_ID, NETWORK_ID);
            console.log('✅ Autocadastro concluído com sucesso');
        } catch (error) {
            console.error('❌ Erro no autocadastro:', error);
        }
    } else {
        console.log('⏭️ Não é mensagem de autocadastro, enviando dados diretamente...');
    }
    
    // Envia os dados para TagoIO (sempre, após autocadastro se necessário)
    await sendDataToTago(messageStr);
});

// Evento de erro
client.on('error', (error) => {
    console.error('Erro de conexão:', error);
});
