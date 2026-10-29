# SagaNexus

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

App mobile para Android e iOS. As decisões de interface devem respeitar os comportamentos de cada sistema. Web não faz parte do escopo de produto confirmado.

## Users

Uso interno da empresa por pessoas que precisam inserir configurações nos gateways Browan Pico Next Indoor da organização. Cargos, perfis de permissão e quantidade de usuários ainda não foram definidos neste contexto.

## Product Purpose

Permitir configurar remotamente os gateways da empresa, independentemente da localização geográfica do equipamento. O resultado esperado é conseguir enviar as configurações pelo app e acompanhar o resultado real informado pelo backend.

Essa promessa descreve o objetivo do produto; não comprova disponibilidade mundial, conectividade permanente ou aplicação bem-sucedida em todos os ambientes.

## Operating Context

Este documento cobre apenas o aplicativo em `mobile_vpn_app/`. O backend em `mobile_vpn/` é uma integração existente e fica fora do escopo de alterações deste trabalho.

As tratativas de segurança do backend serão retomadas posteriormente, aproveitando o trabalho já realizado. Esta definição não atesta que esse trabalho esteja concluído ou validado.

O código atual apresenta autenticação, listagem e detalhes de gateways, configuração Ethernet, acompanhamento de operações e alertas de segurança. Essa relação registra evidência de implementação; não substitui validação funcional em dispositivos reais.

## Capabilities and Constraints

- Preservar as funcionalidades que se comunicam com o backend e seus contratos de integração, incluindo autenticação e os fluxos necessários para configurar os gateways e acompanhar as operações.
- Recursos existentes sem comunicação com o backend não são requisitos de preservação. Sua retirada depende do escopo de um trabalho futuro; este init não remove funcionalidades.
- A estética das funcionalidades está aberta a decisões futuras de design. Este documento não estabelece uma nova direção visual.
- Responsividade é requisito: adaptar as telas aos tamanhos disponíveis em Android e iOS, mantendo conteúdo, formulários e ações utilizáveis.
- Separar com clareza configuração salva, solicitação enviada, operação em andamento e resultado confirmado pelo backend.
- Conectividade necessária para o acesso remoto, cobertura de tablets, distribuição interna e versões mínimas de sistema permanecem em aberto.

## Brand Commitments

Manter o nome SagaNexus e a logo oficial existente. A liberdade estética não autoriza substituir ou redesenhar a logo.

Os arquivos oficiais e seus derivados estão em `mobile_vpn_app/assets/branding/`. A origem e o preparo dos arquivos estão documentados no README dessa pasta.

## Evidence on Hand

- Aplicativo existente em `mobile_vpn_app/`, desenvolvido com Expo e React Native, com rotas em `mobile_vpn_app/src/app/`.
- Configuração de Android e iOS em `mobile_vpn_app/app.json`.
- Logo original e derivados: `mobile_vpn_app/assets/branding/saganexus-original.png`, `saganexus-logo.png` e `saganexus-symbol.png`.
- Público interno, modelos de gateway, plataformas, objetivo, limite de escopo e preservação da logo confirmados pelo responsável pelo projeto.

Não foram fornecidas métricas de disponibilidade, desempenho ou cobertura geográfica comprovada. Não inventar essas evidências.

## Product Principles

1. Priorizar a configuração remota dos gateways no trabalho cotidiano da empresa.
2. Preservar as integrações reais com o backend ao evoluir a interface.
3. Comunicar o estado real das operações sem antecipar confirmação de sucesso.
4. Manter a identidade da marca por meio da logo oficial.
5. Adaptar a experiência aos tamanhos de tela e às convenções de Android e iOS.
