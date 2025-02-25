// Este código implementa a função `sendDataToTago`, que processa dados recebidos de um sistema central e os envia para dispositivos conectados no TagoIO (plataforma de Internet das Coisas). A função faz uso da SDK do TagoIO para se conectar aos dispositivos, recuperar e enviar dados para eles de maneira eficiente, realizando a integração entre os sensores e a plataforma TagoIO.

// A função começa ao processar os dados de entrada, que são esperados em formato JSON. Os dados contêm informações como o número do dispositivo central (SN), dados dos sensores, tempo de operação, dados de fertilização (fert), e status de saída (out).

// A função `mergeArraysWithIdAndTime` é responsável por combinar arrays de dados com base no identificador da variável e no tempo, atribuindo um ID único e o timestamp atual a cada item. Ela também filtra itens que possuem a variável "payload" ou não têm um ID.

// Para cada sensor nos dados recebidos, a função tenta obter um token de autenticação para o dispositivo correspondente utilizando o número de série. Se o dispositivo for encontrado, ela envia os dados dos sensores para a plataforma TagoIO, utilizando o método `sendData` da SDK do TagoIO. Caso haja dados anteriores (como dados antigos armazenados no dispositivo), a função os edita utilizando o método `editData`.

// A função também processa os dados de tempo e fertilização, se presentes, e envia ou edita os dados conforme necessário. Para os dados de saída (`out`), a função envia os valores para os dispositivos, tratando a atualização de variáveis de saída de acordo com o grupo de dispositivos.

const tago_server_udp = require("../middleware/tago_udp_access");
const { parserTagoIo } = require("../payloadParser/payloadParserCentral");

import { Device } from "@tago-io/sdk";
import { Console } from "console";

function mergeArraysWithIdAndTime(firstArray: any, secondArray: any) {
  const currentTime = new Date().toISOString();
  firstArray.forEach((item: { variable: any; id: any; time: string }) => {
    const correspondingItem = secondArray.find(
      (secondItem: { variable: any }) => secondItem.variable === item.variable
    );

    if (correspondingItem) {
      item.id = correspondingItem.id;
      item.time = currentTime;
    }
  });
  // Filtrar para remover o item que tem a variável 'payload' e itens sem 'id'
  const filteredArray = firstArray.filter(
    (item: { variable: string; id: any }) =>
      item.variable !== "payload" && item.id
  );

  return filteredArray;
}

async function sendDataToTago(data: any) {
  data = JSON.parse(data);
  const centralNumber = data.SN;
  const sensorData = data?.data?.sens;
  const timeData = data?.data?.Time;
  const fertData = data?.data?.fert;
  const out = data?.data?.Out;

  for (const sensor in sensorData) {
    const sensorNumber = sensor;
    const serialNumber = `${centralNumber}_${sensorNumber}`;

    const token = await tago_server_udp
      .get_token(serialNumber)
      .catch((e: any) => {
        console.error(e);
      });
    if (!token) {
      console.debug(`Dispositivo nao encontrado com o serial: ${serialNumber}`);
      continue;
    }
    const device = new Device({ token: token });
    if (!device) {
      return console.log(`Device not found, Serial Number: ${serialNumber}`);
    }
    //Sending the data to the device
    await device
      .sendData({
        variable: "payload",
        value: JSON.stringify(sensorData[Number(sensorNumber)]),
      })
      .then(console.log)
      .catch(console.error);
  }

  // for (const sensor in fertData) {
  //   const fertNumber = sensor;
  //   const serialNumber = `${centralNumber}_${fertNumber}`;

  //   const token = await tago_server_udp
  //     .get_token(serialNumber)
  //     .catch((e: any) => {
  //       //console.error(e);
  //     });
  //   if (!token) {
  //     console.debug(`Dispositivo nao encontrado com o serial: ${serialNumber}`);
  //     continue;
  //   }
  //   const device = new Device({ token: token });
  //   if (!device) {
  //     return console.log(`Device not found, Serial Number: ${serialNumber}`);
  //   }
  //   //Sending the data to the device
  //   await device
  //     .sendData({
  //       variable: "payload",
  //       value: JSON.stringify(sensorData[Number(fertNumber)]),
  //     })
  //     .then(console.log)
  //     .catch(console.error);
  // }

  for (const time in timeData) {
    const timeNumber = time;
    const serialNumber = `${centralNumber}`;
    console.log(time);

    const token = await tago_server_udp
      .get_token(serialNumber)
      .catch((e: any) => {
        //console.error(e);
      });
    if (!token) {
      console.debug(`Dispositivo nao encontrado com o serial: ${serialNumber}`);
      continue;
    }
    const device = new Device({ token: token });
    if (!device) {
      return console.log(`Device not found, Serial Number: ${serialNumber}`);
    }

    const tagoData = parserTagoIo([
      {
        variable: "payload",
        value: JSON.stringify(timeData[Number(timeNumber)]),
      },
      {
        variable: "timer_number",
        value: timeNumber,
      },
    ]);
    const oldData = await device.getData({
      variables: "timer_number",
      values: timeNumber,
    });

    if (oldData.length === 0) {
      //Sending the data to the device
      await device.sendData(tagoData).then(console.log).catch(console.error);
    } else {
      const group = oldData[0].group;
      const data = await device.getData({ groups: group, qty: 9999 });
      const arrayResult = mergeArraysWithIdAndTime(tagoData, data);
      await device.editData(arrayResult).then(console.log).catch(console.error);
    }
  }

  if (out) {
    const serialNumber = `${centralNumber}`;

    const token = await tago_server_udp
      .get_token(serialNumber)
      .catch((e: any) => {
        //console.error(e);
      });
    if (!token) {
      console.debug(`Dispositivo nao encontrado com o serial para o output: ${serialNumber}`);
    }
    const device = new Device({ token: token });
    if (!device) {
      return console.log(`Device not found, Serial Number: ${serialNumber}`);
    }

    const arrayOutput: any = out?.ArrOutp;
    //const duration: any = out?.outTime[1];

    let tagoData: any = [];
    for (let i = 0; i < arrayOutput.length; i++) {
      tagoData.push({ variable: `output${i + 1}`, value: arrayOutput[i], group: serialNumber });
      const oldDataOut = await device.getData({
        variables: `output${i + 1}`,
        groups: serialNumber,
      });
      if (oldDataOut.length === 0) {
        await device.sendData({ variable: `output${i + 1}`, value: arrayOutput[i], group: serialNumber }).then(console.log).catch(console.error);
      } else {
        await device.editData({ id: oldDataOut[0].id, value: arrayOutput[i] })
      }
    }
  }


}

export { sendDataToTago };
