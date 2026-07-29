import { Analysis, Resources } from "@tago-io/sdk";
import { alertAnalysis } from "./alertAnalysis";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

async function timerDuration(context: any, scope: any[]) {
  if (!scope.length) {
    return context.log("No data in scope");
  }

  const currentData = scope[0];
  const device_id = currentData.device;
  
  if (!device_id) {
    return context.log("No device ID found");
  }

  context.log(`Timer Duration Analysis triggered for device: ${device_id}`);
  context.log(`Triggered by variable: ${currentData.variable}`);

  const token = context.token;
  const resources = new Resources({ token });

  // Se não for a variável "data", buscar a variável "data" do mesmo device
  let dataPoint = currentData;
  
  if (currentData.variable !== "data" || !currentData.metadata?.EN) {
    context.log("Variable is not 'data' or doesn't have EN metadata, fetching 'data' variable...");
    
    try {
      const dataVariable = await resources.devices.getDeviceData(device_id, {
        variables: ["data"],
        qty: 1
      });
      
      if (dataVariable.length > 0) {
        dataPoint = dataVariable[0];
        context.log(`Found 'data' variable with EN: ${dataPoint.metadata?.EN}`);
      } else {
        return context.log("Could not find 'data' variable for this device");
      }
    } catch (error) {
      return context.log(`Error fetching 'data' variable: ${error}`);
    }
  }

  // Ler OUTST / ONSTR / ONDUR do metadata do sens
  const metadata = dataPoint.metadata || {};

  const currentOUTST = metadata.OUTST;
  const currentONSTR = metadata.ONSTR;
  const currentONDUR = metadata.ONDUR;

  // Converter OUTST para número (1 ou 0)
  let outstValue: number | null = null;
  if (currentOUTST !== undefined) {
    if (typeof currentOUTST === "string") {
      outstValue = Number(currentOUTST);
    } else if (typeof currentOUTST === "boolean") {
      outstValue = currentOUTST ? 1 : 0;
    } else if (typeof currentOUTST === "number") {
      outstValue = currentOUTST;
    }
  }

  context.log(`Current OUTST value: ${outstValue}`);
  context.log(`Current ONSTR: ${currentONSTR}`);
  context.log(`Current ONDUR: ${currentONDUR}`);

  // Se não tiver OUTST, não faz nada
  if (outstValue === null) {
    context.log("No OUTST on metadata, skipping");
    return;
  }

  // Quando OUTST = 1: saída ativada -> enviar timer_start usando ONSTR
  if (outstValue === 1) {
    context.log("OUTST = 1: saída ativada, preparando timer_start a partir de ONSTR");

    if (!currentONSTR) {
      context.log("ONSTR não encontrado no metadata, nada a enviar");
      return;
    }

    const currentTime = dataPoint.time || dataPoint.created_at;
    const activationTime = currentTime ? new Date(currentTime) : new Date();
    const sessionGroup = activationTime.toISOString();

    // Formatar data + hora em BRT (ONSTR vem só com hora, adicionar data)
    const dateBRT = activationTime.toLocaleDateString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    // Combinar data com ONSTR: "dd/MM/yyyy HH:mm"
    const fullDateTime = `${dateBRT} ${currentONSTR}`;

    // Verificar se já enviou timer_start recentemente (evitar duplicatas)
    try {
      const recentTimerStarts = await resources.devices.getDeviceData(device_id, {
        variables: ["timer_start"],
        qty: 5,
      });

      if (recentTimerStarts.length > 0) {
        const lastStart = new Date(recentTimerStarts[0].time || recentTimerStarts[0].created_at || "");
        const timeSinceLastStart = activationTime.getTime() - lastStart.getTime();

        if (timeSinceLastStart < 5000) {
          context.log(`Timer_start already sent recently (${timeSinceLastStart}ms ago), skipping duplicate`);
          return;
        }
      }
    } catch (error) {
      context.log(`Error checking recent timer_start: ${error}`);
    }

    await resources.devices.sendDeviceData(device_id, {
      variable: "timer_start",
      // Valor exibido no widget: data + horário (dd/MM/yyyy HH:mm)
      value: fullDateTime,
      group: sessionGroup,
      metadata: {
        ONSTR: String(currentONSTR),
        full_datetime: fullDateTime,
        original_timestamp: currentTime || new Date().toISOString(),
      },
    });

    context.log(`Timer_start sent: ${fullDateTime}`);
    context.log(`  - ONSTR: ${currentONSTR}`);
    context.log(`  - Group: ${sessionGroup}`);

    return;
  }

  // Quando OUTST = 0: saída desativada -> enviar timer_duration usando ONDUR
  if (outstValue === 0) {
    context.log("OUTST = 0: saída desativada, preparando timer_duration a partir de ONDUR");

    if (!currentONDUR) {
      context.log("ONDUR não encontrado no metadata, nada a enviar");
      return;
    }

    // Buscar o último timer_start para usar o mesmo group e vincular os dados
    let sessionGroup: string;
    
    try {
      const recentTimerStarts = await resources.devices.getDeviceData(device_id, {
        variables: ["timer_start"],
        qty: 1,
      });

      if (recentTimerStarts.length > 0) {
        // Usar o mesmo group do timer_start mais recente
        sessionGroup = recentTimerStarts[0].group || new Date().toISOString();
        context.log(`Using group from last timer_start: ${sessionGroup}`);
      } else {
        // Se não encontrou timer_start, criar um group novo
        sessionGroup = new Date().toISOString();
        context.log("No recent timer_start found, creating new group");
      }
    } catch (error) {
      context.log(`Error fetching recent timer_start: ${error}`);
      sessionGroup = new Date().toISOString();
    }

    // Verificar se já existe duration no mesmo group (evitar duplicatas)
    try {
      const existingDurations = await resources.devices.getDeviceData(device_id, {
        variables: ["timer_duration"],
        groups: sessionGroup,
        qty: 1,
      });

      if (existingDurations.length > 0) {
        context.log(`Timer_duration already exists for group ${sessionGroup}, skipping duplicate`);
        return;
      }
    } catch (error) {
      context.log(`Error checking existing timer_duration: ${error}`);
    }

    await resources.devices.sendDeviceData(device_id, {
      variable: "timer_duration",
      // Valor exibido no widget: tempo ligado vindo do sens (ONDUR)
      value: String(currentONDUR),
      group: sessionGroup,
      metadata: {
        ONDUR: String(currentONDUR),
        original_timestamp: (dataPoint.time || dataPoint.created_at) || new Date().toISOString(),
      },
    });

    context.log(`Timer_duration sent: ${currentONDUR}`);
    context.log(`  - Group: ${sessionGroup} (same as timer_start)`);

    try {
      await alertAnalysis(context, [{
        ...dataPoint,
        variable: "timer_duration",
        value: String(currentONDUR),
        group: sessionGroup,
        device: device_id,
        metadata: {
          ...(dataPoint.metadata || {}),
          ONDUR: String(currentONDUR),
        },
      }]);
    } catch (alertError) {
      context.log(`Error checking duration alerts: ${alertError}`);
    }

    return;
  }

  context.log("OUTST is not 0 or 1, skipping");
}

export { timerDuration };
export default new Analysis(timerDuration, { token: "a-12fb193a-7a9a-4332-8a5d-f80abd45c756" });
