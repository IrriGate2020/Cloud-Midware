// Este código cria um servidor MQTT usando a biblioteca Aedes em conjunto com o módulo 'net' do Node.js. O objetivo é configurar um broker MQTT simples, onde são tratados eventos importantes como conexões e desconexões de clientes, publicações de mensagens e inscrições em tópicos.

// O broker MQTT é instanciado utilizando a classe Aedes e configurado para rodar na porta 1883, que é a porta padrão do MQTT.

// O evento 'client' é disparado sempre que um cliente se conecta ao broker, e o código exibe o ID do cliente.
// O evento 'clientDisconnect' é disparado sempre que um cliente se desconecta, também exibindo seu ID.
// O evento 'publish' trata quando uma mensagem é publicada, exibindo o tópico e o conteúdo da mensagem.
// O evento 'subscribe' é disparado quando um cliente se inscreve em um ou mais tópicos, e imprime os tópicos em que o cliente se inscreveu.

// Por fim, um servidor TCP é criado usando o 'net.createServer', que aceita conexões de clientes MQTT, e é configurado para escutar a porta 1883, permitindo a comunicação com o broker.

import Aedes from 'aedes';
import net from 'net';

const broker = new Aedes();
const port = 1883;

// Evento quando um cliente se conecta
broker.on('client', (client) => {
    console.log(`Cliente conectado: ${client.id}`);
});

// Evento quando um cliente se desconecta
broker.on('clientDisconnect', (client) => {
    console.log(`Cliente desconectado: ${client.id}`);
});

// Evento quando uma mensagem é publicada
broker.on('publish', (packet, client) => {
    console.log(`Mensagem publicada em ${packet.topic}: ${packet.payload.toString()}`);
});

// Evento quando um cliente se inscreve em um tópico
broker.on('subscribe', (subscriptions, client) => {
    if (client) {
        subscriptions.forEach((sub) => {
            console.log(`Cliente ${client.id} inscrito no tópico: ${sub.topic}`);
        });
    }
});

const server = net.createServer(broker.handle);

server.listen(port, () => {
    console.log(`Broker MQTT rodando na porta ${port}`);
});
