# Regras de plano para autocadastro Irrigate

## Retencao de dados por plano

Todo device criado para uma organizacao deve respeitar a retencao do plano ativo:

- Essencial: 7 dias
- Avancado: 30 dias
- Premium: 90 dias

A analysis `manageOrganizationPlan` grava a tag `plan_retention_days` e atualiza o `chunk_retention` nos devices encontrados para a organizacao. Essa tag deve ser usada pela analysis de criacao/autocadastro de devices.

No plano Custom, a retencao pode vir do formulario usando uma destas variaveis:

- `custom_retention_days`
- `plan_retention_days`
- `retention_days`
- `retencao_dias`
- `dias_retencao`

## Criacao de novos sensores/devices

Quando a analysis-irrigate criar um novo device de sensor, ela deve:

1. Buscar a central pela tag `serial_number`.
2. Tentar ler `plan_retention_days` nas tags da central.
3. Se nao encontrar, tentar inferir pela tag `plan`, `plano`, `plan_id`, `plano_id` ou `plan_name`.
4. Se ainda nao encontrar, tentar buscar o device da organizacao usando `organization_device`, `organization_id`, `org_id`, `company_id` ou `group_id` e repetir a leitura das tags de plano/retencao.
5. Criar o device com `chunk_period: "day"` e `chunk_retention` igual ao valor resolvido.
6. Se nenhuma retencao estiver configurada, usar fallback de 30 dias.
7. Gravar no sensor criado a tag `plan_retention_days` com o valor aplicado.
8. Se o sensor ja existir, atualizar o `chunk_retention` e a tag `plan_retention_days` em vez de apenas ignorar.

Exemplo do objeto de criacao/atualizacao do device:

```ts
const retentionDays = resolveRetentionDaysFromPlan(centralDevice, organizationDevice);

await account.devices.create({
  name: sensorName,
  type: "immutable",
  chunk_period: "day",
  chunk_retention: retentionDays,
  tags: [
    { key: "plan_retention_days", value: String(retentionDays) },
    { key: "central_sn", value: centralSN },
    { key: "sensor_number", value: sensorNumber },
  ],
});
```

Mapa de retencao que deve ser usado se vier apenas a tag do plano:

```ts
const PLAN_RETENTION_DAYS = {
  essencial: 7,
  visualizacao: 7,
  avancado: 30,
  intermediario: 30,
  premium: 90,
  diamante: 90,
};
```

## Campo Auto no autocadastro

O campo `Auto` representa o tipo de automacao configurada no sensor:

- 0: Nenhuma
- 1: Irrigacao
- 2: Climatizacao
- 3: Aquecimento
- 4: Nebulizacao
- 5: Monitoramento
- 6: Sombreamento Simples
- 7: Sombreamento Avancado
- 8: Ciclico
- 9: Iluminacao

Somente `Auto = 5` deve ser tratado como sensor de monitoramento, gravando `dev_mode=monitoring`.
Todos os demais valores continuam como `dev_mode=automation`.

## Campo MOD no autocadastro de sensores

O campo `MOD` define o tipo do sensor/dispositivo criado na TagoIO:

- 0: Irrigacao
- 1: Nutricao
- 2: Nutricao 2
- 4: Iluminacao
- 5: Clima
- 6: Climaprime (usa sensor=climate)

Para o Climaprime, `MOD = 6` deve criar o device com `sensor=climate`, `sensor_label=Climaprime` e nome iniciando com `Climaprime`. O autocadastro usa o dashboard com `connector_id=climate`.
