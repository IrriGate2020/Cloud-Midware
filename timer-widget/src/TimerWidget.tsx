import React, { useEffect, useState, useRef } from "react";

type DataPoint = {
  variable: string;
  value: any;
  time?: string;
  created_at?: string;
  group?: string;
  metadata?: {
    EN?: string | number | boolean;
    [key: string]: any;
  };
  device?: string; // Alguns contextos trazem o device aqui
  origin?: {
    id?: string;    // ID do sensor (bucket/device)
    bucket?: string;
  };
};

// Variável configurada no widget (Data from)
const VARIABLE_NAME = "data";

interface TimerState {
  isActive: boolean;
  timerStart: string | null; // ONSTR - horário de início
  timerDuration: string | null; // ONDUR - tempo que ficou ligado
  deviceId?: string; // ID do device para validação
}

function getStorageKey(deviceId?: string): string {
  return `timer-widget-state-${VARIABLE_NAME}-${deviceId || 'unknown'}`;
}

// Funções para persistência no localStorage
function saveTimerState(state: TimerState, deviceId?: string) {
  try {
    const storageKey = getStorageKey(deviceId);
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.error("[TimerWidget] Erro ao salvar estado:", error);
  }
}

function loadTimerState(deviceId?: string): TimerState | null {
  try {
    const storageKey = getStorageKey(deviceId);
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("[TimerWidget] Erro ao carregar estado:", error);
  }
  return null;
}

// Helper para obter o ID do device a partir de um datapoint
function getDeviceIdFromPoint(p: DataPoint): string | undefined {
  return p.device || p.origin?.id;
}

interface TimerWidgetProps {
  initialDeviceId?: string;
  initialData?: DataPoint[];
}

export const TimerWidget: React.FC<TimerWidgetProps> = ({ initialDeviceId, initialData }) => {
  const [isActive, setIsActive] = useState(false);
  const [timerStart, setTimerStart] = useState<string | null>(null); // ONSTR
  const [timerDuration, setTimerDuration] = useState<string | null>(null); // ONDUR
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [widgetDeviceId, setWidgetDeviceId] = useState<string | null>(initialDeviceId || null); // Device configurado no widget
  const lastOUTSTRef = useRef<number | null>(null);
  
  // BUSCAR DEVICE ID DO WIDGET (contexto do dashboard)
  useEffect(() => {
    if (typeof window === "undefined" || !window.TagoIO) {
      return;
    }

    // Tentar pegar device do contexto do widget
    if (window.TagoIO.getContext) {
      window.TagoIO.getContext().then((context: any) => {
        if (context && context.deviceID) {
          console.log("[TimerWidget] Device do widget (contexto):", context.deviceID);
          setWidgetDeviceId(context.deviceID);
        } else {
          console.log("[TimerWidget] Contexto do widget:", context);
        }
      }).catch((err: any) => {
        console.log("[TimerWidget] Sem contexto disponível:", err);
      });
    }
  }, []);
  
  // Função auxiliar para verificar se o dado é do device correto
  const isFromCurrentDevice = (dataPoint: DataPoint): boolean => {
    // Se tem widgetDeviceId definido, usar apenas ele
    if (widgetDeviceId) {
      return getDeviceIdFromPoint(dataPoint) === widgetDeviceId;
    }
    // Se não, usar currentDeviceId (primeiro device que enviou dados)
    if (currentDeviceId) {
      return getDeviceIdFromPoint(dataPoint) === currentDeviceId;
    }
    // Se não tem nenhum device definido ainda, aceita qualquer um
    return true;
  };
  
  // Estado inicial vem dos dados enviados pelo Tago (widget.data via initialData)
  // quando o painel carrega o widget pela primeira vez.
  useEffect(() => {
    if (!initialData || !initialData.length) {
      console.log("[TimerWidget] Nenhum dado inicial recebido em initialData");
      return;
    }

    console.log(`[TimerWidget] Processando ${initialData.length} dados iniciais (widget.data)`);

    // FILTRAR apenas dados do device correto, se já tivermos um
    const targetDeviceId = widgetDeviceId || initialDeviceId || currentDeviceId;
    const filteredResult = targetDeviceId 
      ? initialData.filter((p: DataPoint) => getDeviceIdFromPoint(p) === targetDeviceId)
      : initialData;

    console.log(`[TimerWidget] ${filteredResult.length} dados iniciais após filtro de device (${targetDeviceId})`);

    if (!filteredResult.length) {
      console.log("[TimerWidget] Nenhum dado inicial para o device atual em widget.data");
      return;
    }

    // Processar dados iniciais
    const dataPoints: DataPoint[] = [];
    const timerStartPoints: DataPoint[] = [];
    const timerDurationPoints: DataPoint[] = [];

    filteredResult.forEach((p: DataPoint) => {
        if (p.variable === VARIABLE_NAME) {
          dataPoints.push(p);
        } else if (p.variable === "timer_start") {
          timerStartPoints.push(p);
        } else if (p.variable === "timer_duration") {
          timerDurationPoints.push(p);
        }
      });

      // Processar timer_start inicial (mais recente)
      if (timerStartPoints.length > 0) {
        const latest = timerStartPoints.sort((a, b) => {
          const ta = new Date(a.time || a.created_at || "").getTime();
          const tb = new Date(b.time || b.created_at || "").getTime();
          return tb - ta;
        })[0];

        const onstr = latest.value || latest.metadata?.ONSTR;
        if (onstr) {
          console.log("[TimerWidget] ONSTR recebido:", onstr);
          setTimerStart(String(onstr));
          setCurrentDeviceId(getDeviceIdFromPoint(latest) || currentDeviceId);
        }
      }

      // Processar timer_duration inicial (último registrado)
      if (timerDurationPoints.length > 0) {
        const latest = timerDurationPoints.sort((a, b) => {
          const ta = new Date(a.time || a.created_at || "").getTime();
          const tb = new Date(b.time || b.created_at || "").getTime();
          return tb - ta;
        })[0];

        const ondur = latest.value || latest.metadata?.ONDUR;
        if (ondur) {
          console.log("[TimerWidget] ONDUR recebido:", ondur);
          setTimerDuration(String(ondur));
        }
      }

      // Processar dados normais para pegar device ID e estado atual do OUTST
      if (dataPoints.length > 0) {
        const latest = dataPoints.sort((a, b) => {
          const ta = new Date(a.time || a.created_at || "").getTime();
          const tb = new Date(b.time || b.created_at || "").getTime();
          return tb - ta;
        })[0];

        // Definir device ID se ainda não tiver
        const latestDeviceId = getDeviceIdFromPoint(latest);
        if (!currentDeviceId && latestDeviceId) {
          console.log("[TimerWidget] Definindo currentDeviceId:", latestDeviceId);
          setCurrentDeviceId(latestDeviceId);
        }
        
        // Verificar estado atual do OUTST
        if (latest.metadata && latest.metadata.OUTST !== undefined) {
          const outstRaw = latest.metadata.OUTST;
          const outstNumber = typeof outstRaw === "string" ? Number(outstRaw) : (outstRaw as number | boolean | undefined);
          const currentOUTST = outstNumber === 1 || outstRaw === true || outstRaw === "1" || outstRaw === "true" ? 1 : 0;
          
          console.log("[TimerWidget] Estado atual do OUTST:", currentOUTST, "(valor bruto:", outstRaw, ")");
          lastOUTSTRef.current = currentOUTST;
          setIsActive(currentOUTST === 1);
        }
      }

  }, [initialData, widgetDeviceId, initialDeviceId]);
  
  // Usa apenas os dados em tempo real do TagoIO (onRealtime)
  // Lógica:
  // - Último OUTST recebido (1 ou 0) define se está ativado ou desativado
  // - ONSTR vem com a ativação
  // - ONDUR vem com a desativação
  useEffect(() => {
    if (typeof window === "undefined" || !window.TagoIO) {
      console.warn("[TimerWidget] TagoIO SDK nao encontrado; sem dados em tempo real");
      return;
    }

    console.log("[TimerWidget] Registrando onRealtime para variáveis: data, timer_start, timer_duration");

    const handleRealtime = async (groups: any[]) => {
      const dataPoints: DataPoint[] = [];
      const timerStartPoints: DataPoint[] = [];
      const timerDurationPoints: DataPoint[] = [];

      // Define o device que será usado para filtro
      const targetDeviceId = widgetDeviceId || currentDeviceId;

      groups.forEach((group) => {
        if (!group || !Array.isArray(group.result)) return;
        (group.result as DataPoint[]).forEach((p) => {
          // FILTRAR apenas dados do device correto
          if (targetDeviceId && getDeviceIdFromPoint(p) !== targetDeviceId) {
            return; // Ignora dados de outros devices
          }
          
          if (p.variable === VARIABLE_NAME) {
            dataPoints.push(p);
          } else if (p.variable === "timer_start") {
            timerStartPoints.push(p);
          } else if (p.variable === "timer_duration") {
            timerDurationPoints.push(p);
          }
        });
      });

      console.log(`[TimerWidget] Realtime recebeu ${dataPoints.length} data, ${timerStartPoints.length} timer_start, ${timerDurationPoints.length} timer_duration (device: ${targetDeviceId})`);

      // PROCESSAR timer_start se chegou (ONSTR - início da ativação)
      if (timerStartPoints.length > 0) {
        const latestTimerStart = timerStartPoints[0];
        const deviceId = getDeviceIdFromPoint(latestTimerStart);
        const onstr = latestTimerStart.value || latestTimerStart.metadata?.ONSTR;

        if (deviceId && onstr) {
          console.log("[TimerWidget] ✅ ONSTR recebido via realtime:", onstr);

          if (!currentDeviceId) {
            setCurrentDeviceId(deviceId);
          }

          setTimerStart(String(onstr));
          lastOUTSTRef.current = 1;
          setIsActive(true);
        }
      }
      
      // PROCESSAR timer_duration se chegou (ONDUR - tempo que ficou ligado)
      if (timerDurationPoints.length > 0) {
        const latestDuration = timerDurationPoints[0];
        const ondur = latestDuration.value || latestDuration.metadata?.ONDUR;
        
        if (ondur) {
          console.log("[TimerWidget] ✅ ONDUR recebido:", ondur);
          setTimerDuration(String(ondur));
        }
      }
      
      // PROCESSAR dados normais (variável "data") para OUTST
      if (!dataPoints.length) return;

      // Ordena os novos pontos por tempo (mais recente primeiro)
      const sorted = dataPoints
        .slice()
        .sort((a, b) => {
          const ta = new Date(a.time || a.created_at || "").getTime();
          const tb = new Date(b.time || b.created_at || "").getTime();
          return tb - ta;
        });

      const newestData = sorted[0];
      
      // Definir device ID se ainda não estiver definido
      const incomingDeviceId = getDeviceIdFromPoint(newestData);
      if (!currentDeviceId && incomingDeviceId) {
        console.log(`[TimerWidget] Definindo device ID inicial: ${incomingDeviceId}`);
        setCurrentDeviceId(incomingDeviceId);
      }

      // Procura o último ponto deste lote que tenha OUTST
      const lastWithOUTST = sorted.find((p) => p.metadata && p.metadata.OUTST !== undefined);

      if (!lastWithOUTST) {
        console.log("[TimerWidget] Nenhum OUTST neste lote, mantendo estado atual. OUTST anterior:", lastOUTSTRef.current);
        return;
      }

      const outstRaw = lastWithOUTST.metadata!.OUTST;
      const outstNumber = typeof outstRaw === "string" ? Number(outstRaw) : (outstRaw as number | boolean | undefined);
      const outstActive = outstNumber === 1 || outstRaw === true || outstRaw === "1" || outstRaw === "true";

      console.log("[TimerWidget] Ultimo dado (lote):", newestData);
      console.log("[TimerWidget] Ultimo OUTST (lote):", lastWithOUTST);
      console.log("[TimerWidget] OUTST bruto:", outstRaw, "| ativo:", outstActive);

      if (!outstActive) {
        // OUTST = 0: desativado
        console.log("[TimerWidget] OUTST = 0, saída desativada");
        
        lastOUTSTRef.current = 0;
        setIsActive(false);
        
        // Salvar estado
        saveTimerState({ 
          isActive: false, 
          timerStart: timerStart || null,
          timerDuration: timerDuration || null,
          deviceId: currentDeviceId || undefined
        }, currentDeviceId || undefined);
        
        return;
      }

      // OUTST = 1: ativo
      console.log(`[TimerWidget] OUTST = 1, saída ativada`);
      lastOUTSTRef.current = 1;
      setIsActive(true);

      // Salvar estado
      saveTimerState({ 
        isActive: true, 
        timerStart: timerStart || null,
        timerDuration: timerDuration || null,
        deviceId: currentDeviceId || undefined
      }, currentDeviceId || undefined);
    };

    window.TagoIO.onRealtime(handleRealtime);
  }, [currentDeviceId, widgetDeviceId, timerStart, timerDuration]); // Reagir quando device mudar

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0e1c3f",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        position: "relative",
        padding: "16px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 16 }}>
        Status da Saída
      </div>

      <div
        style={{
          padding: "8px 16px",
          borderRadius: 999,
          background: isActive ? "#2ecc71" : "#e74c3c",
          fontSize: 14,
          textTransform: "uppercase",
          fontWeight: "bold",
          marginBottom: 24,
        }}
      >
        {isActive ? "Ativada" : "Desativada"}
      </div>

      {timerStart && isActive && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            background: "rgba(52, 152, 219, 0.2)",
            borderRadius: 8,
            borderLeft: "3px solid #3498db",
            width: "100%",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
            Horário de Início (ONSTR):
          </div>
          <div style={{ fontSize: 16, fontWeight: "bold", color: "#3498db" }}>
            {timerStart}
          </div>
        </div>
      )}

      {timerDuration && !isActive && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            background: "rgba(46, 204, 113, 0.2)",
            borderRadius: 8,
            borderLeft: "3px solid #2ecc71",
            width: "100%",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
            Tempo Ligado (ONDUR):
          </div>
          <div style={{ fontSize: 16, fontWeight: "bold", color: "#2ecc71" }}>
            {timerDuration}
          </div>
        </div>
      )}

      {!timerStart && !timerDuration && (
        <div
          style={{
            fontSize: 12,
            opacity: 0.5,
            textAlign: "center",
            marginTop: 20,
          }}
        >
          Aguardando dados do sensor...
        </div>
      )}
    </div>
  );
};
