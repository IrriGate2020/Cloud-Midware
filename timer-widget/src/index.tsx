import React from "react";
import { createRoot } from "react-dom/client";
import { TimerWidget } from "./TimerWidget";

declare global {
  interface Window {
    TagoIO?: any;
  }
}

const VARIABLE_NAME = "data";

// ATENÇÃO: Este token é sensível. Evite commitar em repositórios públicos.
const ACCOUNT_TOKEN = "ff300c89-19a5-4446-9571-f276837dee18";

// Cache para coordenar onStart
let cachedWidget: any | null = null;
let cachedInitialDeviceId: string | undefined;
let hasMounted = false;

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("root");
  if (!container) return;

  const root = createRoot(container);

  const mount = (initialDeviceId?: string, initialData?: any[]) => {
    root.render(<TimerWidget initialDeviceId={initialDeviceId} initialData={initialData} />);
  };

  // Busca dados históricos via API do TagoIO usando um token fixo de conta/dispositivo
  const fetchInitialDataFromAPI = async (deviceId: string): Promise<any[]> => {
    const baseURL: string = "https://api.tago.io";
    const token: string | undefined = ACCOUNT_TOKEN;

    if (!token) {
      console.warn("[TimerWidget] ACCOUNT_TOKEN não configurado; não é possível buscar histórico");
      return [];
    }

    console.log("[TimerWidget] Buscando histórico via API para device:", deviceId, "em:", baseURL);

    const variablesToLoad = ["data", "timer_start", "timer_duration"];
    const qtyMap: Record<string, number> = {
      data: 50,
      timer_start: 10,
      timer_duration: 10,
    };

    const requests = variablesToLoad.map(async (variable) => {
      const qty = qtyMap[variable] || 10;

      // Segue o padrão do SDK: Resources.devices.getDeviceData(deviceId, queryParams)
      // que chama GET /device/{deviceId}/data com query params (qty, variables, order, ...)
      const params = new URLSearchParams({
        qty: String(qty),
        order: "desc",
      });
      // "variables" pode ser enviado múltiplas vezes, aqui usamos um por requisição
      params.append("variables", variable);

      const url = `${baseURL.replace(/\/$/, "")}/device/${encodeURIComponent(deviceId)}/data?${params.toString()}`;

      try {
        const resp = await fetch(url, {
          headers: {
            Authorization: token,
          },
        });

        const json = await resp.json();

        if (!json || json.status === false) {
          console.warn(`[TimerWidget] Erro ao buscar variável ${variable}:`, json?.message || json);
          return [];
        }

        const result = Array.isArray(json.result) ? json.result : [];
        console.log(`[TimerWidget] ${result.length} registros carregados para variável ${variable}`);
        return result;
      } catch (error) {
        console.error(`[TimerWidget] Falha ao chamar API para variável ${variable}:`, error);
        return [];
      }
    });

    const results = await Promise.all(requests);
    const flat = ([] as any[]).concat(...results);
    console.log(`[TimerWidget] Total de ${flat.length} registros históricos carregados via API`);
    return flat;
  };

  const tryInitialize = () => {
    if (hasMounted) return;

    // Precisamos ao menos do widget (onStart) e do deviceId inicial
    if (!cachedWidget || !cachedInitialDeviceId) return;

    const initialDeviceId = cachedInitialDeviceId;

    hasMounted = true;

    fetchInitialDataFromAPI(initialDeviceId)
      .then((initialData) => {
        mount(initialDeviceId, initialData);
      })
      .catch((error) => {
        console.error("[TimerWidget] Erro ao buscar histórico inicial:", error);
        mount(initialDeviceId, []);
      });
  };

  if (window.TagoIO) {
    window.TagoIO.onStart((widget: any) => {
      const variables = widget?.display?.variables || [];

      console.log("[TimerWidget] Widget iniciado com variaveis:", variables);

      // Tentar descobrir o device inicial a partir do origin.id das variáveis
      let initialDeviceId: string | undefined;

      for (const v of variables) {
        // Priorizar variável 'data' (ou VARIABLE_NAME), mas aceitar qualquer uma com origin.id
        const varName = v.variable || v.var || "";
        const originId = v.origin?.id as string | undefined;
        if (originId && (!initialDeviceId || varName === VARIABLE_NAME)) {
          initialDeviceId = originId;
          if (varName === VARIABLE_NAME) break;
        }
      }

      console.log("[TimerWidget] initialDeviceId derivado de origin:", initialDeviceId);

      cachedWidget = widget;
      cachedInitialDeviceId = initialDeviceId;
      tryInitialize();
    });

    window.TagoIO.onError((error: any) => {
      console.error("[TimerWidget] Erro no widget TagoIO:", error);
    });

    window.TagoIO.ready({
      header: {
        color: "#2196F3",
      },
    });
  } else {
    console.warn("[TimerWidget] window.TagoIO nao encontrado; executando em modo standalone");
    mount();
  }
});
