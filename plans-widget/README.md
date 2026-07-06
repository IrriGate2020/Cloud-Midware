# TagoIO Plans Widget

Custom widget visual para explicar os planos da IrriGate dentro do dashboard da TagoIO.
Inclui a chamada "Entre em contato para planos personalizados" para orientar clientes fora dos limites padrao.

## Uso

Suba o arquivo `plans-widget/index.html` no Files da TagoIO e aponte o Custom Widget para esse HTML.

Este widget e apenas informativo. Ele nao cria alerta, relatorio ou plano; essa parte fica na analysis `manageOrganizationPlan`.

## Planos exibidos

- Essencial(Visualizacao): 5 sensores, sem alertas e sem relatorios.
- Avancado: 10 sensores, 10 alertas, 1 relatorio, abertura de chamados diretamente com o time de suporte e atendimento critico em ate 6 horas uteis.
- Premium: 30 sensores, 30 alertas, 5 relatorios, abertura de chamados diretamente com o time de suporte, abertura de chamados integrado com o Whatsapp e atendimento critico em ate 3 horas uteis ou ate 6 horas em dias nao uteis.
