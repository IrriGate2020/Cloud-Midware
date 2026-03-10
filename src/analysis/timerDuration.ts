import { Analysis, Resources } from "@tago-io/sdk";

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

  // Verificar o valor atual de EN no metadata
  const currentEN = dataPoint.metadata?.EN;
  
  // Converter EN para número
  let enValue: number | null = null;
  if (currentEN !== undefined) {
    if (typeof currentEN === "string") {
      enValue = Number(currentEN);
    } else if (typeof currentEN === "boolean") {
      enValue = currentEN ? 1 : 0;
    } else if (typeof currentEN === "number") {
      enValue = currentEN;
    }
  }

  context.log(`Current EN value: ${enValue}`);

  // Processar baseado no valor de EN
  if (enValue === 1) {
    // EN = 1: Enviar timer_start IMEDIATAMENTE para o widget começar do zero
    context.log("EN = 1: Timer activated, sending timer_start");
    
    const currentTime = dataPoint.time || dataPoint.created_at;
    const activationTime = currentTime ? new Date(currentTime) : new Date();
    const sessionGroup = activationTime.toISOString();
    
    // Verificar se já enviou timer_start recentemente (evitar duplicatas)
    try {
      const recentTimerStarts = await resources.devices.getDeviceData(device_id, {
        variables: ["timer_start"],
        qty: 5
      });
      
      // Se já tem um timer_start com menos de 5 segundos, não enviar de novo
      if (recentTimerStarts.length > 0) {
        const lastStart = new Date(recentTimerStarts[0].time || recentTimerStarts[0].created_at || "");
        const timeSinceLastStart = activationTime.getTime() - lastStart.getTime();
        
        if (timeSinceLastStart < 5000) { // Menos de 5 segundos
          context.log(`Timer_start already sent recently (${timeSinceLastStart}ms ago), skipping duplicate`);
          return;
        }
      }
    } catch (error) {
      context.log(`Error checking recent timer_start: ${error}`);
    }
    
    const startDateBRT = activationTime.toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Enviar timer_start AGORA para o widget começar do zero
    await resources.devices.sendDeviceData(device_id, {
      variable: "timer_start",
      value: startDateBRT,
      group: sessionGroup,
      metadata: {
        timestamp: activationTime.getTime(),
        start_time: activationTime.toISOString(),
        start_date: activationTime.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        start_hour: activationTime.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      }
    });
    
    context.log(`Timer_start sent: ${startDateBRT}`);
    context.log(`  - Timestamp: ${activationTime.getTime()}`);
    context.log(`  - Group: ${sessionGroup}`);
    
    return;
  }

  // Só processa duração se EN = 0 (desativado)
  if (enValue !== 0) {
    context.log("EN is not 0 or 1, skipping");
    return;
  }
  
  // Verificar se já calculou a duração recentemente
  // Buscar por group para evitar processar a mesma sessão múltiplas vezes
  context.log("Checking for duplicate timer_duration...");

  // Buscar os últimos dados com EN para encontrar quando estava ativo
  try {
    const recentData = await resources.devices.getDeviceData(device_id, {
      variables: ["data"],
      qty: 100, // Buscar últimos 100 dados
      ordination: "descending"
    });

    context.log(`Found ${recentData.length} recent data points`);

    // Encontrar o ponto mais recente onde EN era 1 (ativo)
    let activationPoint: any = null;
    let deactivationPoint: any = null;

    for (const data of recentData) {
      const dataEN = data.metadata?.EN;
      let dataENValue: number | null = null;

      if (dataEN !== undefined) {
        if (typeof dataEN === "string") {
          dataENValue = Number(dataEN);
        } else if (typeof dataEN === "boolean") {
          dataENValue = dataEN ? 1 : 0;
        } else if (typeof dataEN === "number") {
          dataENValue = dataEN;
        }
      }

      // Primeiro EN=0 encontrado (mais recente) é a desativação
      if (dataENValue === 0 && !deactivationPoint) {
        deactivationPoint = data;
        context.log(`Deactivation point found at: ${data.time || data.created_at}`);
      }

      // Primeiro EN=1 encontrado após o EN=0 é a ativação
      if (dataENValue === 1 && deactivationPoint && !activationPoint) {
        activationPoint = data;
        context.log(`Activation point found at: ${data.time || data.created_at}`);
        break;
      }
    }

    if (!activationPoint || !deactivationPoint) {
      context.log("Could not find activation/deactivation pair");
      return;
    }

    // Calcular duração
    const activationTime = new Date(activationPoint.time || activationPoint.created_at || "");
    const deactivationTime = new Date(deactivationPoint.time || deactivationPoint.created_at || "");

    const durationMs = deactivationTime.getTime() - activationTime.getTime();

    if (durationMs <= 0) {
      context.log("Invalid duration (negative or zero), skipping");
      return;
    }

    const durationSeconds = Math.floor(durationMs / 1000);
    const formattedDuration = formatDuration(durationMs);

    context.log(`Duration calculated: ${formattedDuration} (${durationSeconds}s)`);
    context.log(`  - Start: ${activationTime.toISOString()}`);
    context.log(`  - End: ${deactivationTime.toISOString()}`);

    // Usar a mesma ISO string como group para timer_start e timer_duration aparecerem juntos
    const sessionGroup = activationTime.toISOString();
    
    // Verificar se já existe dados com este group (sessão já processada)
    try {
      const existingData = await resources.devices.getDeviceData(device_id, {
        variables: ["timer_duration"],
        qty: 10
      });
      
      const alreadyProcessed = existingData.some(d => d.group === sessionGroup);
      if (alreadyProcessed) {
        context.log(`Session ${sessionGroup} already processed, skipping duplicate`);
        return;
      }
    } catch (error) {
      context.log(`Error checking for duplicate session: ${error}`);
    }
    
    // Formatar data de início em BRT legível
    const startDateBRT = activationTime.toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // NÃO enviar timer_start aqui, pois já foi enviado quando EN=1
    // Enviar apenas timer_duration com o mesmo group do timer_start que já foi enviado
    await resources.devices.sendDeviceData(device_id, {
      variable: "timer_duration",
      value: formattedDuration, // Formato HH:MM:SS
      group: sessionGroup,
      metadata: {
        duration_seconds: durationSeconds, // Segundos para cálculos
        formatted_time: formattedDuration,
        start_time: activationTime.toISOString(),
        end_time: deactivationTime.toISOString(),
        start_date: activationTime.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        start_hour: activationTime.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        end_date: deactivationTime.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        end_hour: deactivationTime.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      }
    });

    context.log("Timer duration data sent successfully to device bucket");
    context.log(`  - Group: ${sessionGroup}`);
    context.log(`  - timer_duration: ${formattedDuration}`);

  } catch (error) {
    context.log(`Error calculating timer duration: ${error}`);
  }
}

export { timerDuration };
export default new Analysis(timerDuration, { token: "a-12fb193a-7a9a-4332-8a5d-f80abd45c756" });
