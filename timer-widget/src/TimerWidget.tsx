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
  activeSince: string | null;
  lastEN: number | null;
  lastRecordedTime?: number; // Último tempo registrado quando desativou (em ms)
  deviceId?: string; // ID do device para validação
}

function getStorageKey(deviceId?: string): string {
  return `timer-widget-state-${VARIABLE_NAME}-${deviceId || 'unknown'}`;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastRecordedTime, setLastRecordedTime] = useState<number>(0);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [widgetDeviceId, setWidgetDeviceId] = useState<string | null>(initialDeviceId || null); // Device configurado no widget
  const activeSinceRef = useRef<Date | null>(null);
  const lastENRef = useRef<number | null>(null);
  const lastDataRef = useRef<DataPoint | null>(null);
  
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

    // Processar dados iniciais (mesmo handler que usávamos com getData)
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

        const timestamp = latest.metadata?.timestamp || latest.value;
        const deviceId = getDeviceIdFromPoint(latest);
        
        if (timestamp && deviceId) {
          const startDate = new Date(Number(timestamp));
          console.log("[TimerWidget] Último timer_start:", startDate.toLocaleString('pt-BR'));
          
          // Verificar se tem timer_duration correspondente (mesma sessão)
          const hasDuration = timerDurationPoints.some(d => {
            // Timer foi finalizado se tem duration DEPOIS do start
            const durationTime = new Date(d.time || d.created_at || "").getTime();
            const startTime = new Date(latest.time || latest.created_at || "").getTime();
            return durationTime > startTime;
          });
          
          if (!hasDuration) {
            // Não tem duration = timer ainda ativo
            activeSinceRef.current = startDate;
            lastENRef.current = 1;
            setIsActive(true);
            // Ao voltar para a tela, usar o tempo decorrido desde o timer_start
            const diff = Date.now() - startDate.getTime();
            setElapsedMs(diff > 0 ? diff : 0);
            setCurrentDeviceId(deviceId);
            console.log("[TimerWidget] Timer ativo desde carregamento inicial, tempo já decorrido:", formatDuration(diff));
          } else {
            console.log("[TimerWidget] Timer já foi finalizado");
          }
        }
      }

      // Processar timer_duration inicial (último registrado)
      if (timerDurationPoints.length > 0) {
        const latest = timerDurationPoints.sort((a, b) => {
          const ta = new Date(a.time || a.created_at || "").getTime();
          const tb = new Date(b.time || b.created_at || "").getTime();
          return tb - ta;
        })[0];

        const durationSeconds = latest.metadata?.duration_seconds;
        if (durationSeconds) {
          const durationMs = durationSeconds * 1000;
          setLastRecordedTime(durationMs);
          console.log("[TimerWidget] Último timer_duration:", formatDuration(durationMs));
        }
      }

      // Processar dados normais para pegar device ID e estado atual do EN
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
        
        // Verificar estado atual do EN
        if (latest.metadata && latest.metadata.EN !== undefined) {
          const enRaw = latest.metadata.EN;
          const enNumber = typeof enRaw === "string" ? Number(enRaw) : (enRaw as number | boolean | undefined);
          const currentEN = enNumber === 1 || enRaw === true || enRaw === "1" || enRaw === "true" ? 1 : 0;
          
          console.log("[TimerWidget] Estado atual do EN:", currentEN, "(valor bruto:", enRaw, ")");
          lastENRef.current = currentEN;
          
          if (currentEN === 0) {
            // EN = 0: garantir que o timer não está ativo
            setIsActive(false);
            activeSinceRef.current = null;
            setElapsedMs(0);
          } else if (currentEN === 1 && !activeSinceRef.current) {
            // EN = 1 e não temos activeSince definido (por ex.: não encontramos timer_start histórico)
            // Neste caso, considerar o timer ativo desde o último "data" recebido.
            const startTime = new Date(latest.time || latest.created_at || Date.now());
            activeSinceRef.current = startTime;
            setIsActive(true);
            const diff = Date.now() - startTime.getTime();
            setElapsedMs(diff > 0 ? diff : 0);
            console.log("[TimerWidget] EN=1 sem timer_start histórico; iniciando timer a partir do último dado:", startTime.toLocaleString('pt-BR'));
          }
        }
      }

  }, [initialData, widgetDeviceId, initialDeviceId]);
  
  // Usa apenas os dados em tempo real do TagoIO (onRealtime)
  // Lógica:
  // - Último EN recebido (1 ou 0) define se está ativo ou inativo
  // - Quando EN==1, o tempo de referência é o tempo do último dado recebido (independente de ter EN)
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

      // PROCESSAR timer_start se chegou (tem prioridade!)
      if (timerStartPoints.length > 0) {
        const latestTimerStart = timerStartPoints[0];
        const deviceId = getDeviceIdFromPoint(latestTimerStart);

        if (deviceId) {
          console.log("[TimerWidget] ✅ timer_start recebido via realtime para device:", deviceId);

          if (!currentDeviceId) {
            setCurrentDeviceId(deviceId);
          }

          // IMPORTANTE: para o cronômetro visual, sempre começamos AGORA,
          // independente do timestamp que veio no dado (evita acumular tempo antigo).
          const startDate = new Date();
          activeSinceRef.current = startDate;
          lastENRef.current = 1;
          setIsActive(true);
          setElapsedMs(0); // Novo ciclo: começa de 0

          console.log(`[TimerWidget] Timer INICIADO AGORA (realtime): ${startDate.toLocaleString('pt-BR')}`);
        }
      }
      
      // PROCESSAR timer_duration se chegou (significa que desativou)
      if (timerDurationPoints.length > 0) {
        const latestDuration = timerDurationPoints[0];
        const durationSeconds = latestDuration.metadata?.duration_seconds;
        
        if (durationSeconds) {
          const durationMs = durationSeconds * 1000;
          console.log("[TimerWidget] ✅ timer_duration recebido:", formatDuration(durationMs));
          setLastRecordedTime(durationMs);
        }
      }
      
      // PROCESSAR dados normais (variável "data")
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

      // Atualiza o último dado global se este for mais recente
      const currentLast = lastDataRef.current;
      const newestTime = new Date(newestData.time || newestData.created_at || "").getTime();
      const currentLastTime = currentLast
        ? new Date(currentLast.time || currentLast.created_at || "").getTime()
        : 0;

      if (!currentLast || newestTime >= currentLastTime) {
        lastDataRef.current = newestData;
      }

      // Procura o último ponto deste lote que tenha EN
      const lastWithEN = sorted.find((p) => p.metadata && p.metadata.EN !== undefined);

      if (!lastWithEN) {
        console.log("[TimerWidget] Nenhum EN neste lote, mantendo estado atual. EN anterior:", lastENRef.current);
        return;
      }

      const enRaw = lastWithEN.metadata!.EN;
      const enNumber = typeof enRaw === "string" ? Number(enRaw) : (enRaw as number | boolean | undefined);
      const nowActive = enNumber === 1 || enRaw === true || enRaw === "1" || enRaw === "true";

      console.log("[TimerWidget] Ultimo dado (lote):", newestData);
      console.log("[TimerWidget] Ultimo EN (lote):", lastWithEN);
      console.log("[TimerWidget] EN bruto:", enRaw, "| ativo:", nowActive);

      if (!nowActive) {
        // EN = 0: apenas desativar visualmente
        // A análise vai calcular e enviar timer_start + timer_duration
        console.log("[TimerWidget] EN = 0, desativando timer (aguardando timer_duration da análise)");
        
        lastENRef.current = 0;
        setIsActive(false);
        activeSinceRef.current = null;
        setElapsedMs(0);
        
        // Salvar estado sem calcular tempo (a análise faz isso)
        saveTimerState({ 
          isActive: false, 
          activeSince: null, 
          lastEN: 0,
          deviceId: currentDeviceId || undefined
        }, currentDeviceId || undefined);
        
        return;
      }

      // EN = 1: marcar como ativo, mas NÃO definir tempo de início aqui
      // O tempo correto virá do timer_start enviado pela análise
      console.log(`[TimerWidget] EN = 1 recebido`);

      // Se ainda não tem timer ativo (sem activeSince), apenas marcar que deveria estar ativo
      // O timer_start vai definir o tempo correto
      if (!activeSinceRef.current) {
        console.log(`[TimerWidget] Aguardando timer_start para definir tempo de início...`);
        // Não fazer nada, esperar timer_start chegar
      } else {
        // Já tem um timer rodando, mantém
        console.log(`[TimerWidget] Timer já está ativo desde: ${activeSinceRef.current?.toLocaleString('pt-BR')}`);
      }

      lastENRef.current = 1;
    };

    window.TagoIO.onRealtime(handleRealtime);
  }, [currentDeviceId, widgetDeviceId]); // Reagir quando device mudar

  // Atualiza o cronômetro a cada segundo quando está ativo
  useEffect(() => {
    if (!isActive || !activeSinceRef.current) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = now.getTime() - activeSinceRef.current!.getTime();
      setElapsedMs(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  // (Tudo vem de onRealtime, sem chamada direta à API)

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
      }}
    >
      {(widgetDeviceId || currentDeviceId) && (
        <div style={{ 
          position: 'absolute', 
          top: 8, 
          right: 8, 
          fontSize: 10, 
          opacity: 0.5,
          background: 'rgba(255,255,255,0.1)',
          padding: '2px 8px',
          borderRadius: 4
        }}>
          Device: {(widgetDeviceId || currentDeviceId)?.substring(0, 8)}...
        </div>
      )}
      
      <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 8 }}>
        Tempo ativo de: {VARIABLE_NAME}
      </div>

      <div
        style={{
          fontSize: 32,
          fontWeight: "bold",
          letterSpacing: 2,
          marginBottom: 8,
        }}
      >
        {formatDuration(elapsedMs)}
      </div>

      <div
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          background: isActive ? "#2ecc71" : "#e74c3c",
          fontSize: 12,
          textTransform: "uppercase",
        }}
      >
        {isActive ? "Ativo" : "Inativo"}
      </div>

      {lastRecordedTime > 0 && (
        <div
          style={{
            marginTop: 20,
            padding: "12px 16px",
            background: "rgba(255, 255, 255, 0.1)",
            borderRadius: 8,
            borderLeft: "3px solid #3498db",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
            Último tempo registrado:
          </div>
          <div style={{ fontSize: 20, fontWeight: "bold", color: "#3498db" }}>
            {formatDuration(lastRecordedTime)}
          </div>
        </div>
      )}
    </div>
  );
};
