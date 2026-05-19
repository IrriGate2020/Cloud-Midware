# TagoIO Support Widget

Custom widget para a Central de Suporte com abertura de tarefas no Asana e opcionalmente botao de WhatsApp.

## Build

```bash
cd support-widget
npm run build
```

O build final fica em `support-widget/dist`.

## Modos

- `support-center`: formulario completo de suporte integrado ao Asana.
- `asana-whatsapp`: formulario compacto integrado ao Asana com botao para WhatsApp.

O modo pode ser configurado por query string:

```text
index.html?mode=support-center
index.html?mode=asana-whatsapp
```

## Configuracao hardcoded

As credenciais e destinos ficam no objeto `HARDCODED_CONFIG` em `src/index.ts`.

Campos:

- `mode`: `support-center` ou `asana-whatsapp`
- `asanaToken`: Personal Access Token do Asana
- `asanaWorkspaceId`: GID do workspace Asana
- `asanaProjectId`: GID do projeto Asana onde as tarefas serao criadas
- `asanaAssignee`: GID do responsavel padrao (opcional)
- `whatsappNumber`: numero da empresa em formato internacional, somente digitos. Exemplo: `5511999999999`
- `companyName`: nome exibido no cabecalho

> Evite publicar o `asanaToken` diretamente em repositorios publicos. Quando possivel, prefira um backend/analysis na TagoIO para intermediar a chamada ao Asana.
