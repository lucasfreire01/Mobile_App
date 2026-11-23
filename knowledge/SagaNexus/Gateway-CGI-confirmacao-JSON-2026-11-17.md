# Gateway: confirmacao de entrega JSON

Falha apos autorizacao do PC: SSH, MAC e executaveis validos, mas CGI do gateway nao suportava HTTP_ACCEPT=application/json. Relay exige accepted=true. Configuracao de enrollment pendente foi validada contra /api/v1/gateways/enrollment/claim, com CA configurada, e retornou 404. Nenhum segredo foi exposto.

Aplicado scripts/browan_package/enroll.cgi no gateway 10.43.0.126 com backup do CGI anterior. Configuracao pendente rejeitada movida para enrollment.conf.rejected-before-json com modo 600. CGI real validado em caminho de erro: HTTP 400 e JSON accepted=false, sem escrever novo enrollment. SSH e estado pronto verificados. Testes existentes de relay/CGI, startup e descoberta passaram; positivo completo no celular ainda nao confirmado. APK inalterado.
