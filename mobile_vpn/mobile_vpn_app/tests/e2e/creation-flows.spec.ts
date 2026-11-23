import { expect, test, type Page, type Route } from "@playwright/test";

const pairingGateway = {
  id: 24,
  ip: "192.168.50.40",
  model: "Browan de teste",
  mac: "02:00:00:00:00:24",
  port: 8800,
};
const pairingPc = { model: "PC de teste", username: "qa" };
const pairingSessionId = "2c24a618-c7fd-4a38-8d8a-1539a1de0d24";
const renewedEnrollmentCode = "e2e-only".padEnd(43, "_");

async function openAdminScreen(
  page: Page,
  destination: "gateway" | "user",
  discoverPairingBridge = false,
) {
  await page.route("**/auth/login", (route: Route) =>
    route.fulfill({
      contentType: "application/json",
      json: {
        data: {
          token: "e2e-test-token",
          user: {
            id: 1,
            email: "qa@example.test",
            fullName: "Equipe QA",
            isAdmin: true,
          },
        },
      },
    }),
  );
  await page.route("**/api/v1/gateways?*", (route: Route) =>
    route.fulfill({
      contentType: "application/json",
      json: {
        gatewaysList: [],
        meta: { total: 0, currentPage: 1, lastPage: 1 },
        summary: { total: 0, online: 0, offline: 0 },
      },
    }),
  );
  await page.route("https://api.ipify.org?format=json", (route) =>
    route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      json: { ip: "192.168.50.120" },
    }),
  );
  // Keep all discovery probes in Playwright, including hosts without a bridge.
  await page.route(/:8787\/saganexus-discovery(?:\?.*)?$/, (route) => {
    const headers = { "access-control-allow-origin": "*" };
    if (discoverPairingBridge && new URL(route.request().url()).hostname === "192.168.50.1") {
      return route.fulfill({
        headers,
        json: {
          service: "saganexus-lan-bridge-v1",
          pc: pairingPc,
          gateways: [pairingGateway],
          pairing: { sessionId: pairingSessionId, expiresAt: Date.now() + 600_000 },
        },
      });
    }
    return route.fulfill({ status: 404, headers, json: {} });
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill("qa@example.test");
  await page.getByRole("textbox", { name: "Senha" }).fill("e2e-test-password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/gateways\/?$/);
  await page.getByRole("button", { name: destination === "gateway" ? /NOVO GATEWAY/i : /NOVO USUÁRIO/i }).click();
}

async function fillUserForm(page: Page, password = "correct horse battery") {
  await page.getByPlaceholder("Nome da pessoa").fill("  Pessoa de Teste  ");
  await page.getByPlaceholder("nome@empresa.com").fill("  QA.User@Example.Test  ");
  await page.getByPlaceholder("Mínimo 8 caracteres").fill(password);
  await page.getByPlaceholder("Digite a senha novamente").fill(password);
}

async function startGatewayPairing(
  page: Page,
  result: "online" | "pending" | "failed",
) {
  const sessionPath = `**/api/v1/gateway-bridge-sessions/${pairingSessionId}`;
  const gatewayPath = `**/api/v1/gateways/${pairingGateway.id}`;
  await page.route("**/api/v1/gateways", (route) =>
    route.fulfill({
      status: 201,
      json: {
        gateway: { id: pairingGateway.id },
        enrollmentCode: "e2e-initial".padEnd(43, "_"),
      },
    }),
  );
  await page.route(`${gatewayPath}/enrollment/renew`, (route) =>
    route.fulfill({ json: { enrollmentCode: renewedEnrollmentCode } }),
  );
  await page.route(`${sessionPath}/approve`, (route) =>
    route.fulfill({ json: { status: "approved" } }),
  );
  await page.route(sessionPath, (route) =>
    route.fulfill({ json: { status: result === "failed" ? "failed" : "submitted" } }),
  );
  await page.route(gatewayPath, (route) =>
    route.fulfill({ json: { gateway: { status: result === "online" ? "online" : "offline" } } }),
  );

  await openAdminScreen(page, "gateway", true);
  await page.getByText(pairingPc.model, { exact: true }).click();
  await expect(page.getByText("Gateway conectado", { exact: true })).toBeVisible();
  await expect(page.getByText(pairingGateway.model, { exact: true })).toBeVisible();
  await page.getByText(`MAC ${pairingGateway.mac}`, { exact: true }).click();
  await page.getByPlaceholder("Ex.: Filial Curitiba").fill("Filial de Pareamento");
  await page.getByRole("button", { name: "Criar gateway" }).click();
  await expect(page.getByRole("heading", { name: "Gateway criado" })).toBeVisible();

  const pairButton = page.getByRole("button", { name: "Parear gateway" });
  await expect(pairButton).toBeEnabled();
  const renewal = page.waitForRequest(`${gatewayPath}/enrollment/renew`);
  const approval = page.waitForRequest(`${sessionPath}/approve`);
  await pairButton.click();
  expect((await renewal).method()).toBe("POST");
  const approvalRequest = await approval;
  expect(approvalRequest.method()).toBe("POST");
  expect(new URL(approvalRequest.url()).protocol).toBe("https:");
  expect(approvalRequest.postDataJSON()).toEqual({
    gatewayId: pairingGateway.id,
    gatewayMac: pairingGateway.mac,
    enrollmentCode: renewedEnrollmentCode,
  });
}

test("usuário exige que as senhas coincidam antes de enviar", async ({ page }) => {
  let createRequests = 0;
  await page.route("**/api/v1/users", async (route: Route) => {
    createRequests += 1;
    await route.fulfill({ status: 500, json: {} });
  });
  await openAdminScreen(page, "user");
  await fillUserForm(page);
  await page.getByPlaceholder("Digite a senha novamente").fill("different password");
  await page.getByRole("button", { name: "Criar usuário" }).click();

  await expect(page.getByRole("alert")).toHaveText("As senhas não conferem.");
  expect(createRequests).toBe(0);
});

test("cadastro de usuário distingue campos vazios na tela e na API", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  const errors = [
    { field: "fullName", message: "Informe o nome." },
    { field: "email", message: "Informe o e-mail." },
  ];
  await page.route("**/api/v1/users", (route) => {
    const error = errors[requests.length];
    requests.push(route.request().postDataJSON());
    return error
      ? route.fulfill({ status: 422, json: { errors: [error] } })
      : route.fulfill({ status: 201, json: { user: { email: "qa.user@example.test" } } });
  });
  await openAdminScreen(page, "user");
  await fillUserForm(page);
  const submit = page.getByRole("button", { name: "Criar usuário" });
  const alert = page.getByRole("alert");
  const name = page.getByPlaceholder("Nome da pessoa");
  const email = page.getByPlaceholder("nome@empresa.com");
  const password = page.getByPlaceholder("Mínimo 8 caracteres");
  const confirmation = page.getByPlaceholder("Digite a senha novamente");

  await name.clear();
  await submit.click();
  await expect(alert).toHaveText("Informe o nome.");
  await name.fill("Pessoa de Teste");
  await email.clear();
  await submit.click();
  await expect(alert).toHaveText("Informe o e-mail.");
  await email.fill("qa.user@example.test");
  await password.clear();
  await submit.click();
  await expect(alert).toHaveText("Informe a senha.");
  await password.fill("correct horse battery");
  await confirmation.clear();
  await submit.click();
  await expect(alert).toHaveText("Confirme a senha.");
  await password.clear();
  await submit.click();
  await expect(alert).toHaveText("Informe a senha.");
  await password.fill("        ");
  await confirmation.fill("        ");
  await submit.click();
  await expect(alert).toHaveText("Informe a senha.");
  const passwordWithSpaces = "  correct horse battery  ";
  await password.fill(passwordWithSpaces);
  await submit.click();
  await expect(alert).toHaveText("Confirme a senha.");
  expect(requests).toHaveLength(2);
  await confirmation.fill(passwordWithSpaces);
  await submit.click();
  await expect(page.getByRole("heading", { name: "Usuário criado" })).toBeVisible();

  const validFields = {
    fullName: "Pessoa de Teste",
    email: "qa.user@example.test",
    password: "correct horse battery",
    passwordConfirmation: "correct horse battery",
    isAdmin: false,
  };
  expect(requests).toEqual([
    { ...validFields, fullName: "" },
    { ...validFields, email: "" },
    { ...validFields, password: passwordWithSpaces, passwordConfirmation: passwordWithSpaces },
  ]);
});

test("erro do servidor ao criar usuário fica visível e permite corrigir", async ({ page }) => {
  await page.route("**/api/v1/users", (route: Route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      json: { errors: [{ message: "Este e-mail já está em uso." }] },
    }),
  );
  await openAdminScreen(page, "user");
  await fillUserForm(page);
  await page.getByRole("button", { name: "Criar usuário" }).click();

  await expect(page.getByRole("alert")).toHaveText("Este e-mail já está em uso.");
  await expect(page.getByPlaceholder("nome@empresa.com")).toBeVisible();
});

test("usuário é criado e permite voltar aos gateways", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/v1/users", async (route: Route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      json: { user: { email: "qa.user@example.test" } },
    });
  });
  await openAdminScreen(page, "user");
  await fillUserForm(page);
  await page.getByRole("button", { name: "Criar usuário" }).click();

  await expect(page.getByRole("heading", { name: "Usuário criado" })).toBeVisible();
  await expect(page.getByText(/qa\.user@example\.test/)).toBeVisible();
  expect(submitted).toMatchObject({
    fullName: "Pessoa de Teste",
    email: "qa.user@example.test",
    isAdmin: false,
  });
  await page.getByRole("button", { name: "Voltar aos gateways" }).click();
  await expect(page).toHaveURL(/\/gateways\/?$/);
});

test("gateway exige nome e mostra quando a busca não encontra uma ponte", async ({ page }) => {
  let createRequests = 0;
  await page.route("**/api/v1/gateways", async (route: Route) => {
    if (route.request().method() === "POST") createRequests += 1;
    await route.fulfill({ status: 500, json: {} });
  });
  await openAdminScreen(page, "gateway");

  await expect(page.getByText(/Nenhum gateway foi encontrado/)).toBeVisible();
  await page.getByRole("button", { name: "Buscar PCs novamente" }).click();
  await expect(page.getByText(/Nenhum gateway foi encontrado/)).toBeVisible();
  const submit = page.getByRole("button", { name: "Criar gateway" });
  await submit.click();
  await expect(page.getByRole("alert")).toHaveText("Informe um nome para identificar o gateway.");
  await page.getByPlaceholder("Ex.: Filial Curitiba").fill("   ");
  await submit.click();
  await expect(page.getByRole("alert")).toHaveText("Informe um nome para identificar o gateway.");
  expect(createRequests).toBe(0);
});

test("cadastro de gateway aceita somente o nome com os campos opcionais vazios", async ({ page }) => {
  let submitted: unknown;
  await page.route("**/api/v1/gateways", (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { gateway: { id: 24 }, enrollmentCode: "E2E-ONLY-NOT-A-REAL-CODE" },
    });
  });
  await openAdminScreen(page, "gateway");
  await page.getByPlaceholder("Ex.: Filial Curitiba").fill("Filial sem campos opcionais");
  await expect(page.getByPlaceholder("16 caracteres hexadecimais (opcional)")).toHaveValue("");
  await expect(page.getByPlaceholder("Ex.: Sala técnica — Curitiba")).toHaveValue("");
  await expect(page.getByPlaceholder("Automático se ficar em branco")).toHaveValue("");
  await page.getByRole("button", { name: "Criar gateway" }).click();
  await expect(page.getByRole("heading", { name: "Gateway criado" })).toBeVisible();
  expect(submitted).toEqual({ name: "Filial sem campos opcionais" });
});

test("falha ao criar gateway é exibida sem sair do formulário", async ({ page }) => {
  await page.route("**/api/v1/gateways", (route: Route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      json: { errors: [{ message: "Gateway já cadastrado." }] },
    }),
  );
  await openAdminScreen(page, "gateway");
  await page.getByPlaceholder("Ex.: Filial Curitiba").fill("Filial de Teste");
  await page.getByRole("button", { name: "Criar gateway" }).click();

  await expect(page.getByRole("alert")).toHaveText("Gateway já cadastrado.");
  await expect(page.getByPlaceholder("Ex.: Filial Curitiba")).toBeVisible();
});

test("gateway é criado com campos normalizados e abre o passo de pareamento", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/v1/gateways", async (route: Route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      json: {
        gateway: { id: 24 },
        enrollmentCode: "E2E-ONLY-NOT-A-REAL-CODE",
      },
    });
  });
  await openAdminScreen(page, "gateway");
  await page.getByPlaceholder("Ex.: Filial Curitiba").fill("  Filial de Teste  ");
  await page.getByPlaceholder("16 caracteres hexadecimais (opcional)").fill("a1b2c3d4e5f60718");
  await page.getByPlaceholder("Ex.: Sala técnica — Curitiba").fill("  Sala QA  ");
  await page.getByPlaceholder("Automático se ficar em branco").fill("  192.0.2.24  ");
  await page.getByRole("button", { name: "Criar gateway" }).click();

  await expect(page.getByRole("heading", { name: "Gateway criado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Parear gateway" })).toBeDisabled();
  expect(submitted).toEqual({
    name: "Filial de Teste",
    gatewayEui: "A1B2C3D4E5F60718",
    location: "Sala QA",
    managementIpAddress: "192.0.2.24",
  });
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page).toHaveURL(/\/gateways\/?$/);
});

test("pareamento descobre a ponte, seleciona o gateway e confirma que está online", async ({ page }) => {
  await startGatewayPairing(page, "online");
  await expect(page.getByText("PC autorizado pelo servidor", { exact: true })).toBeVisible();
  await expect(page.getByText("Gateway confirmou o recebimento", { exact: true })).toBeVisible();
  await expect(page.getByText("Servidor confirmou o gateway online", { exact: true })).toBeVisible();
  await expect(page.getByText("Gateway pareado e online", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pareamento concluído" })).toBeDisabled();
  await page.getByRole("button", { name: "Voltar aos gateways" }).click();
  await expect(page).toHaveURL(/\/gateways\/?$/);
});

test("pareamento com recebimento confirmado permite sair enquanto aguarda o estado online", async ({ page }) => {
  await page.clock.install();
  await startGatewayPairing(page, "pending");
  await expect(page.getByText("Gateway confirmou o recebimento", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Voltar", exact: true })).toBeDisabled();
  await page.clock.fastForward(124_000);
  await expect(page.getByText("Aguardando confirmação online", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recebimento confirmado" })).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar aos gateways" }).click();
  await expect(page).toHaveURL(/\/gateways\/?$/);
});

test("pareamento com falha na ponte mostra o erro e permite tentar novamente", async ({ page }) => {
  await startGatewayPairing(page, "failed");
  await expect(page.getByRole("alert")).toHaveText(
    "A ponte não conseguiu acessar o gateway. Verifique o cabo e tente novamente.",
  );
  await expect(page.getByText("Pareamento precisa de atenção", { exact: true })).toBeVisible();
  await expect(page.getByText("Gateway confirmou o recebimento", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Parear gateway" })).toBeEnabled();
  await page.getByRole("button", { name: "Voltar aos gateways" }).click();
  await expect(page).toHaveURL(/\/gateways\/?$/);
});

test("botão voltar cancela a criação de gateway e de usuário", async ({ page }) => {
  await openAdminScreen(page, "gateway");
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page).toHaveURL(/\/gateways\/?$/);

  await page.getByRole("button", { name: /NOVO USUÁRIO/i }).click();
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page).toHaveURL(/\/gateways\/?$/);
});

test("usuário mostra a rejeição de um campo inválido e permite corrigir", async ({ page }) => {
  await page.route("**/api/v1/users", (route) => route.fulfill({
    status: 422,
    json: { errors: [{ field: "email", message: "Informe um endereço de e-mail válido." }] },
  }));
  await openAdminScreen(page, "user");
  await fillUserForm(page);
  const email = page.getByPlaceholder("nome@empresa.com");
  await email.fill("endereco-invalido");
  const requested = page.waitForRequest("**/api/v1/users");
  await page.getByRole("button", { name: "Criar usuário" }).click();

  expect((await requested).postDataJSON().email).toBe("endereco-invalido");
  await expect(page.getByRole("alert")).toHaveText("Informe um endereço de e-mail válido.");
  await expect(email).toBeEditable();
  await expect(email).toHaveValue("endereco-invalido");
});

test("usuário pode alternar e enviar a permissão de administrador", async ({ page }) => {
  await page.route("**/api/v1/users", (route) => route.fulfill({
    status: 201,
    json: { user: { email: "qa.user@example.test" } },
  }));
  await openAdminScreen(page, "user");
  await fillUserForm(page);
  const admin = page.getByRole("checkbox", { name: /Acesso de administrador/ });
  const checkMark = admin.getByText("✓", { exact: true });
  await expect(checkMark).toHaveCount(0);
  await admin.click();
  await expect(checkMark).toBeVisible();
  await admin.click();
  await expect(checkMark).toHaveCount(0);
  await admin.click();
  await expect(checkMark).toBeVisible();
  const requested = page.waitForRequest("**/api/v1/users");
  await page.getByRole("button", { name: "Criar usuário" }).click();

  expect((await requested).postDataJSON().isAdmin).toBe(true);
  await expect(page.getByRole("heading", { name: "Usuário criado" })).toBeVisible();
});
