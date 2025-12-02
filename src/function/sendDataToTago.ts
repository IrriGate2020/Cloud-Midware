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

  return firstArray.map((item: { variable: string; value: any }) => ({
    variable: item.variable,
    value: item.value,
    time: currentTime,
  }));
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

    const sensorConfig = sensorData[Number(sensorNumber)];
    const group = new Date().toISOString();

    // monta dados do sensor nesse group (sem apagar históricos)
    const sensorBase: any[] = [
      {
        variable: "payload",
        value: JSON.stringify(sensorConfig),
        group,
      },
    ];

    // exemplo: habilitado / alvo / limite / tempos máximos e de irrigação
    if (typeof sensorConfig?.EN !== "undefined") {
      sensorBase.push({
        variable: "sens_enable",
        value: sensorConfig.EN ? "Sim" : "Não",
        group,
      });
    }
    if (typeof sensorConfig?.OBJ !== "undefined") {
      sensorBase.push({ variable: "obj", value: sensorConfig.OBJ, group });
    }
    if (typeof sensorConfig?.LIM !== "undefined") {
      sensorBase.push({ variable: "lim", value: sensorConfig.LIM, group });
    }

    // tempos configurados em variáveis separadas
    if (typeof sensorConfig?.DMaHh !== "undefined" || typeof sensorConfig?.DMaMi !== "undefined") {
      sensorBase.push({
        variable: "dma",
        value: `${String(sensorConfig.DMaHh || 0).padStart(2, "0")}:${String(
          sensorConfig.DMaMi || 0
        ).padStart(2, "0")}`,
        group,
      });
    }

    if (typeof sensorConfig?.IMiHh !== "undefined" || typeof sensorConfig?.IMiMi !== "undefined") {
      sensorBase.push({
        variable: "imi",
        value: `${String(sensorConfig.IMiHh || 0).padStart(2, "0")}:${String(
          sensorConfig.IMiMi || 0
        ).padStart(2, "0")}`,
        group,
      });
    }

    if (typeof sensorConfig?.WTinih !== "undefined" || typeof sensorConfig?.WTinim !== "undefined") {
      sensorBase.push({
        variable: "wtini",
        value: `${String(sensorConfig.WTinih || 0).padStart(2, "0")}:${String(
          sensorConfig.WTinim || 0
        ).padStart(2, "0")}`,
        group,
      });
    }

    if (typeof sensorConfig?.WTendh !== "undefined" || typeof sensorConfig?.WTendm !== "undefined") {
      sensorBase.push({
        variable: "wtend",
        value: `${String(sensorConfig.WTendh || 0).padStart(2, "0")}:${String(
          sensorConfig.WTendm || 0
        ).padStart(2, "0")}`,
        group,
      });
    }

    if (typeof sensorConfig?.LTemp !== "undefined") {
      sensorBase.push({ variable: "ltemp", value: sensorConfig.LTemp, group });
    }

    if (typeof sensorConfig?.LHum !== "undefined") {
      sensorBase.push({ variable: "lhum", value: sensorConfig.LHum, group });
    }

    // Apenas insere novos dados com group único (ISO string), sem apagar históricos
    await device.sendData(sensorBase).then(console.log).catch(console.error);
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

    // ignora campos que não são timers numéricos (ex: Active)
    if (isNaN(Number(timeNumber))) {
      continue;
    }

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

    console.log(await device.info());
    const timerConfig = timeData[Number(timeNumber)];

    // define um group fixo para todos os dados deste timer
    const group = `timer_${timeNumber}`;

    // monta dados base: payload + timer_number, todos com o mesmo group
    const baseData: any[] = [
      {
        variable: "payload",
        value: JSON.stringify(timerConfig),
        group,
      },
      {
        variable: "timer_number",
        value: timeNumber,
        group,
      },
    ];

    // dias da semana (sem[0..6] => dom..sab)
    const weekArray: number[] = timerConfig?.sem || [];
    const weekVars = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    weekVars.forEach((dayVar, idx) => {
      const flag = weekArray[idx] === 1;
      baseData.push({
        variable: dayVar,
        value: flag,
        group,
      });
    });

    // enable e init_time derivados do timer
    const enabled = timerConfig?.EN === 1;
    const hh = String(timerConfig?.HhIni ?? 0).padStart(2, "0");
    const mmInit = String(timerConfig?.MinIni ?? 0).padStart(2, "0");
    const initTime = `${hh}:${mmInit}`;

    baseData.push(
      {
        variable: "enable",
        value: enabled ? "Sim" : "Nao",
        group,
      },
      {
        variable: "init_time",
        value: initTime,
        group,
      }
    );

    // adiciona variáveis setX (saídas habilitadas) e duration_setor
    const setArray: number[] = timerConfig?.SET || [];
    const secArray: number[] = timerConfig?.ArrSecDu || [];
    const minArray: number[] = timerConfig?.ArrMinDu || [];

    setArray.forEach((sectorNumber: number, index: number) => {
      // seta saída habilitada
      baseData.push({
        variable: `set${sectorNumber}`,
        value: true,
        group,
      });

      // duration associada a esse setor, usando o mesmo índice
      const sec = secArray[index] || 0;
      const min = minArray[index] || 0;

      const mm = String(min).padStart(2, "0");
      const ss = String(sec).padStart(2, "0");
      const durationString = `${mm}:${ss}`;

      baseData.push({
        variable: `duration_${sectorNumber}`,
        value: durationString,
        group,
      });
    });

    // procura qualquer dado deste timer pelo group específico
    const oldData = await device.getData({
      groups: group,
      qty: 1,
    });

    if (oldData.length === 0) {
      // Envia tudo como novo dado
      await device.sendData(baseData).then(console.log).catch(console.error);
    } else {
      // Apaga totalmente o grupo antigo (inclui duration_*, set*, etc.) e recria com dados atuais
      await device
        .deleteData({ groups: group, qty: 9999 })
        .then(console.log)
        .catch(console.error);

      await device.sendData(baseData).then(console.log).catch(console.error);
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
