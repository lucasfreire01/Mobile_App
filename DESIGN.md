---
name: SagaNexus
description: "Rede em movimento: estrutura azul, superfícies minerais e estados legíveis."
colors:
  shell: "#102f46"
  primary: "#164f66"
  canvas: "#f1f4ef"
  selection: "#e5efed"
  online: "#138466"
  apply: "#11634d"
  success-surface: "#e1f2e9"
  white: "#ffffff"
  ink: "#0f172a"
  muted: "#475569"
  placeholder: "#64748b"
  field-border: "#cbd5e1"
  divider: "#cddbd5"
  shell-muted: "#b9ced5"
  offline-surface: "#f1f5f9"
  processing-surface: "#fffbeb"
  processing-ink: "#92400e"
  error-surface: "#fef2f2"
  error-ink: "#991b1b"
typography:
  display:
    fontFamily: "system-ui"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: "44px"
    letterSpacing: "-0.9px"
  title:
    fontFamily: "system-ui"
    fontSize: "24px"
    fontWeight: 700
  body:
    fontFamily: "system-ui"
    fontSize: "16px"
    lineHeight: "24px"
  label:
    fontFamily: "system-ui"
    fontSize: "14px"
    fontWeight: 600
  status:
    fontFamily: "system-ui"
    fontSize: "12px"
    fontWeight: 600
rounded:
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  1.5: "6px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.xl}"
    typography: "{typography.label}"
  button-header:
    backgroundColor: "rgba(255,255,255,0.1)"
    textColor: "{colors.white}"
    rounded: "{rounded.xl}"
  button-apply:
    backgroundColor: "{colors.apply}"
    textColor: "{colors.white}"
    rounded: "{rounded.xl}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.primary}"
    rounded: "{rounded.xl}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  status-online:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.apply}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  empty-container:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.2xl}"
    padding: "20px"
---

# Design System: SagaNexus

## Overview

**Creative North Star: "Rede em movimento"**

Rede em movimento combina uma estrutura azul profunda com superfícies minerais claras e leitura operacional direta. O movimento aparece no sinal de estado e nas transições da marca; a informação permanece estável e legível.

A logo oficial permanece íntegra, sobre uma pequena reserva branca. A tipografia do sistema e as superfícies planas mantêm a identidade próxima do trabalho cotidiano.

**Key Characteristics:**
- Azul profundo como estrutura; mineral claro como área de trabalho.
- Estados com texto e cor, sem depender apenas de pigmento.
- Controles arredondados e hierarquia tipográfica direta.

## Colors

### Primary
O azul profundo da estrutura (`shell`) organiza a identidade; o azul de ação (`primary`) identifica botões, seleção e navegação. `selection` suaviza áreas selecionadas.

### Secondary
O verde de presença (`online`) marca conectividade; o verde profundo (`apply`) sustenta a ação de aplicar e o texto sobre `success-surface`. Processamento usa âmbar; falha usa vermelho. A fila permanece azul clara.

### Neutral
`canvas` é o mineral claro recorrente. Branco sustenta campos e a reserva da logo. `ink`, `muted` e `placeholder` hierarquizam leitura; `field-border` e `divider` separam sem adicionar profundidade. `shell-muted` é texto secundário sobre azul.

**The Confirmed State Rule.** O verde de sucesso acompanha confirmação; fila e aplicação em curso conservam estados próprios.

## Typography

A família é a padrão de cada plataforma; `system-ui` no frontmatter representa essa intenção, não uma fonte web instalada no app. Não há fonte personalizada carregada. Títulos fortes contrastam com corpo regular e rótulos semibold. O display aparece a (36/44); títulos operacionais usam (24) e (30), com ampliações existentes em largura maior. Corpo usa (16/24), apoio usa (14/20–24) e estados usam (12/16). Medidas representam unidades de estilo React Native; equivalentes CSS servem à prévia.

## Layout

O ritmo recorrente usa passos de (4), com intervalos e preenchimentos de (8), (12), (16), (20), (24) e (32). Alinhamento de rótulo e valor e limites sutis mantêm a leitura compacta. Conteúdo fluido respeita limites de largura existentes (448) e (1024); o breakpoint `md` (768) amplia margens e alguns agrupamentos. A composição de cada tela pertence a `.impeccable/surfaces/mobile-app.md`. As ações têm altura mínima (48); campos e envio de credenciais usam (56).

## Elevation & Depth

As superfícies atuais são planas: separadores, contraste tonal e reservas brancas constroem profundidade, sem sombras de cartões. O carregamento usa sobreposição branca a (80%) e pulso do símbolo em dois trechos de (850 ms), apenas quando movimento reduzido está explicitamente desativado. O splash tem etapas de (360 ms) e (480 ms). Estes tempos não confirmam resultado de operações.

## Shapes

Cantos discretamente curvos (8) envolvem a marca e seleções menores. Campos e botões usam (12), recipientes de vazio usam (16) e indicadores de estado são cápsulas. Linhas de equipamento e atividade usam borda inferior, sem converter cada registro em cartão elevado.

## Components

- **Buttons:** ação principal azul, aplicação verde profunda, secundário branco com contorno azul e ação de cabeçalho branca translúcida. Pressionar escurece o azul ou altera a opacidade; indisponibilidade usa opacidade reduzida ou cinza, conforme o componente existente.
- **Inputs / Fields:** fundo branco, contorno neutro, texto escuro e preenchimento horizontal (16). O fallback DHCP usa o controle Switch nativo da plataforma. O e-mail possui mudança de borda no foco; os demais campos não oferecem ainda um tratamento de foco uniforme.
- **Chips:** cápsulas com texto semibold; presença inclui ponto de (8). Online e aplicada compartilham superfície verde clara; offline usa cinza, fila azul claro, aplicação âmbar e falha vermelho.
- **Cards / Containers:** recipientes de vazio brancos com contorno; seções e registros recorrentes permanecem planos sobre mineral claro.
- **Navigation:** voltar, atualizar e sair são ações textuais em controles translúcidos no cabeçalho azul. Filtros têm seleção azul e fundo branco quando inativos.
- **Brand:** imagem oficial intacta em reserva branca com cantos (8), preenchimento (12 × 6), imagem (128 × 36). O símbolo oficial é reutilizado no carregamento.

As prévias `.impeccable/review/*web*.png` são evidência de navegador; as rotas autenticadas dessas prévias usam dados sintéticos. Validação Android/iOS permanece pendente. `darkMode: class` na configuração não constitui um tema escuro implementado.

## Do's and Don'ts

### Do:
- Do preservar a logo oficial em sua reserva branca.
- Do combinar texto com cor nos estados.
- Do usar a tipografia do sistema para leitura operacional.
- Do respeitar a preferência de movimento reduzido.

### Don't:
- Don't redesenhar ou recolorir a logo.
- Don't usar verde de sucesso para uma operação apenas enviada.
- Don't transformar a configuração darkMode do Tailwind em alegação de tema escuro implementado.
- Don't tratar prévias web como validação em Android ou iOS.
