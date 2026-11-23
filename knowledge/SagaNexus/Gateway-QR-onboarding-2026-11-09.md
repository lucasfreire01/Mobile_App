# QR no cadastro de gateway — 2026-11-09

- Etapa 1 implementada em `mobile_vpn_app/src/app/gateways/new.tsx`: tela criada mostra QR do código existente, mantém texto copiável e validade de 24 h.
- Instalados `react-native-svg` compatível com Expo SDK 58 e `react-native-qrcode-svg` no app; npm ci foi necessário porque node_modules não existia.
- `npx tsc --noEmit` e `npx expo lint -- src/app/gateways/new.tsx` passaram.
- SVG usa módulo nativo: requer novo development build para executar no aparelho. QR só exibe o código e ainda não substitui o pacote individual. Próxima etapa é pacote reutilizável com tela de vínculo Browan; app deve ligar QR ao endpoint de claim após scanner/pareamento seguro.
- Para liberar disco após ENOSPC, removidos somente caches regeneráveis `/home/lucas/.npm/_cacache`, `~/.cache/ms-playwright`, `~/.cache/puppeteer`. 2.3 GB livres após limpeza; baixar esses navegadores novamente se necessários.
- Etapa pacote reutilizável implementada localmente em `scripts/build_browan_enrollment_package.py`, `scripts/browan_package/install.sh` e novo `scripts/browan_package/enroll.cgi`. Bundle inclui agente, CA pública, URL do backend e CGI, sem código individual. Install grava CGI no painel e configura agente/cron com backup/rollback.
- CGI aceita somente POST HTTPS, valida origem e formato do código, grava configuração com modo 600 e aciona o agente. Página oferece BarcodeDetector QR e entrada manual para compatibilidade; erro de câmera preserva fallback manual.
- Checagens locais passaram: `sh -n` nos scripts, compilação Python, contrato de arquivos do pacote genérico, ausência de código de teste no archive, modo 600, validação HTTPS/origem, configuração protegida e acionamento do agente com código fictício. Não instalado no Browan; validação real do CGI sob servidor web e da leitura de câmera pendente.
Decisao 2026-11-09: seguir com codigo temporario sem QR no app. Tela de novo gateway continua mostrando o codigo copiavel; removidas as dependencias de renderizacao QR. O APK precisa ser recompilado para refletir a tela.
