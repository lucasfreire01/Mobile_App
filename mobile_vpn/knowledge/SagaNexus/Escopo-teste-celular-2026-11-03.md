# Escopo de teste no celular — 2026-11-03

- Usuário esclareceu: responsabilidade é construir o aplicativo; infraestrutura definitiva pertence ao chefe.
- Objetivo: app instalado no celular e comunicação com gateway conectado à internet por RJ45, com o PC desligado.
- Precisa de hospedagem temporária para testar o fluxo; não solicitou implantação de infraestrutura definitiva.
- Código verificado: gateway_status_job usa GatewaySshService; hospedar somente o banco não substitui backend/worker nem conectividade com o gateway.
- Próxima definição: plataforma do celular e ambiente temporário com backend, banco e acesso VPN ao gateway. Nenhum serviço externo contratado ou publicado.

- Preparado mobile_vpn_app/eas.json com perfil preview interno e android.buildType apk; JSON validado. APK ainda não gerado: falta endereço público da API e configuração/autenticação EAS. Escolha entre hospedagem gratuita/paga pendente; nenhum recurso externo criado.
