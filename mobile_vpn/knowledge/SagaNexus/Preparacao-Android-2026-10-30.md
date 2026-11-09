# Preparação Android — 2026-10-30

- Disco inicialmente com cerca de 20 MB livres. Limpeza autorizada de cache de downloads npm (`npm cache clean --force`) liberou cerca de 2,2 GB; projetos e node_modules preservados. Medição final aproximada: 2,4 GB livres.
- ADB oficial Google 37.0.1-15733141 baixado em `/tmp/saganexus-android/platform-tools/adb`. Temporário, não instalado globalmente. `adb devices -l` não detectou dispositivos.
- CPU anuncia virtualização, mas `/dev/kvm` não existe. Sem Java, SDK Android completo ou emulador. Não foi tentada instalação de emulador por espaço insuficiente para o ambiente completo.
- Bundle JavaScript Android gerado pelo Expo real: HTTP 200, 8.369.118 bytes. Não é build APK nem execução nativa.
- Evidência: `mobile_vpn/docs/android-native-readiness-verification.json`.
- Próxima ação: conectar Android com depuração USB e autorização de acesso, ou disponibilizar espaço/virtualização para emulador. Preferência de aparelho/emulador perguntada e ainda sem resposta nesta etapa. Nenhum teste nativo Android/iOS executado.
- Fontes oficiais consultadas: https://developer.android.com/tools/releases/platform-tools e https://docs.expo.dev/workflow/android-studio-emulator/.
