# Regras de plano para autocadastro Irrigate

## Retencao de dados por plano

Ao atribuir um plano para uma organizacao, a analysis `manageOrganizationPlan` grava a tag `plan_retention_days` e atualiza o `chunk_retention` dos devices da organizacao.

Valores padrao:

- Essencial: 7 dias
- Avancado: 30 dias
- Premium: 90 dias

No plano Custom, a retenção pode vir pelo formulario usando uma destas variaveis:

- `custom_retention_days`
- `plan_retention_days`
- `retention_days`
- `retencao_dias`
- `dias_retencao`

## Criacao de novos sensores

Quando o autocadastro criar um novo device de sensor, ele deve:

1. Buscar a central pela tag `serial_number`.
2. Ler `plan_retention_days` nas tags da central.
3. Se nao encontrar, tentar ler a mesma tag no device da organizacao indicado por `organization_id`.
4. Criar o sensor com `chunk_period: "day"` e `chunk_retention` igual ao valor encontrado.
5. Se nenhuma retencao estiver configurada, usar fallback de 30 dias.
6. Gravar no sensor a tag `plan_retention_days` com o valor aplicado.

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

Somente `Auto = 5` deve ser tratado como sensor de monitoramento no cadastro, gravando `dev_mode=monitoring`.
Todos os demais valores continuam como `dev_mode=automation`.
