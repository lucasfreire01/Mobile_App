import { expect, test, type Page, type Route } from "@playwright/test";

const gateway = {
  id: 24,
  name: "Gateway Central",
  status: "online",
  managementIpAddress: "10.200.0.2",
  wanIpAddress: "198.51.100.10",
};

const firstOperation = {
  id: 301,
  action: "Atualizar configuração de rede",
  status: "applied",
  createdAt: "2026-11-18T12:00:00.000Z",
  startedAt: "2026-11-18T12:00:01.000Z",
  finishedAt: "2026-11-18T12:00:05.000Z",
  attempts: 1,
  requestedByEmail: "qa@example.test",
  errorCode: null,
  errorMessage: null,
};

const secondOperation = {
  ...firstOperation,
  id: 302,
  action: "Atualizar rota VPN",
};

async function signIn(page: Page) {
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
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("qa@example.test");
  await page.getByRole("textbox", { name: "Senha" }).fill("e2e-test-password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/gateways\/?$/);
}

async function mockGatewayEndpoints(
  page: Page,
  options: {
    failDetails?: boolean;
    failAlerts?: boolean;
    failOperationsOnce?: boolean;
    transientPendingOperation?: boolean;
    emptyOperations?: boolean;
    delayOperations?: boolean;
  } = {},
) {
  let operationsFailureSent = false;
  let operationReads = 0;
  await page.route("**/api/v1/gateways/24**", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/network-operations")) {
      if (options.transientPendingOperation && url.searchParams.get("limit") === "1") {
        operationReads += 1;
        if (operationReads === 2) {
          await route.fulfill({
            status: 503,
            json: { errors: [{ message: "Operação temporariamente indisponível." }] },
          });
          return;
        }
        await route.fulfill({
          json: {
            operations: [
              operationReads === 1
                ? { ...firstOperation, status: "pending", attempts: 0 }
                : firstOperation,
            ],
          },
        });
        return;
      }
      if (
        options.failOperationsOnce &&
        url.searchParams.get("limit") === "20" &&
        !operationsFailureSent
      ) {
        operationsFailureSent = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          json: { errors: [{ message: "Histórico temporariamente indisponível." }] },
        });
        return;
      }
      if (options.delayOperations && url.searchParams.get("limit") === "20") {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      const empty = options.emptyOperations && url.searchParams.get("limit") === "20";
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      const operations = empty
        ? []
        : pageNumber === 1
          ? [firstOperation]
          : [secondOperation];
      await route.fulfill({
        contentType: "application/json",
        json: {
          operations,
          meta: {
            currentPage: pageNumber,
            lastPage: empty ? 1 : 2,
            total: empty ? 0 : 2,
          },
        },
      });
      return;
    }

    if (url.pathname.endsWith("/ethernet")) {
      if (options.failDetails) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          json: { errors: [{ message: "Configuração Ethernet indisponível." }] },
        });
        return;
      }
      await route.fulfill({ contentType: "application/json", json: { ethernetConfigs: [] } });
      return;
    }

    if (url.pathname.endsWith("/security-alerts")) {
      if (options.failAlerts) {
        await route.fulfill({
          status: 503,
          json: { errors: [{ message: "Alertas temporariamente indisponíveis." }] },
        });
        return;
      }
      await route.fulfill({ contentType: "application/json", json: { alerts: [] } });
      return;
    }

    if (url.pathname.replace(/\/$/, "").endsWith("/gateways/24")) {
      await route.fulfill({ contentType: "application/json", json: { gateway } });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", json: { errors: [{ message: "Not found" }] } });
  });
}

async function openDetails(page: Page) {
  await page.route("**/api/v1/gateways?*", (route: Route) =>
    route.fulfill({
      contentType: "application/json",
      json: {
        gatewaysList: [gateway],
        meta: { total: 1, currentPage: 1, lastPage: 1 },
        summary: { total: 1, online: 1, offline: 0 },
      },
    }),
  );
  await signIn(page);
  await page.getByRole("button", { name: "Gateway Central, online" }).click();
  await expect(page).toHaveURL(/\/gateways\/24\/?$/);
}

test("detalhes abrem o histórico, paginam operações e permitem voltar", async ({ page }) => {
  await mockGatewayEndpoints(page);
  await openDetails(page);

  await expect(page.getByRole("heading", { name: "Gerenciar gateway" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gateway Central" })).toBeVisible();
  await page.getByRole("button", { name: "Ver histórico de operações" }).click();
  await expect(page.getByRole("heading", { name: "Histórico de operações" })).toBeVisible();
  await expect(page.getByText("Atualizar configuração de rede", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Carregar mais" }).click();
  await expect(page.getByText("Atualizar rota VPN")).toBeVisible();

  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByRole("heading", { name: "Gerenciar gateway" })).toBeVisible();
});

test("detalhes mostram falha de carregamento da configuração", async ({ page }) => {
  await mockGatewayEndpoints(page, { failDetails: true });
  await openDetails(page);

  await expect(page.getByRole("alert")).toHaveText("Configuração Ethernet indisponível.");
});

test("falha de alertas preserva os detalhes principais", async ({ page }) => {
  await mockGatewayEndpoints(page, { failAlerts: true });
  await openDetails(page);

  await expect(page.getByRole("heading", { name: "Gateway Central" })).toBeVisible();
  await expect(page.getByText("Atualizar configuração de rede", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Alertas temporariamente indisponíveis.");
});

test("falha transitória não interrompe o acompanhamento da operação", async ({ page }) => {
  await mockGatewayEndpoints(page, { transientPendingOperation: true });
  await openDetails(page);

  await expect(page.getByText(/Operação #301.*aguardando/i)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Operação temporariamente indisponível.", {
    timeout: 7_000,
  });
  await expect(page.getByText(/Operação #301.*aplicad/i)).toBeVisible({ timeout: 12_000 });
});

test("histórico vazio explica que não há operações registradas", async ({ page }) => {
  await mockGatewayEndpoints(page, { emptyOperations: true });
  await openDetails(page);
  await page.getByRole("button", { name: "Ver histórico de operações" }).click();

  await expect(page.getByText("Nenhuma operação registrada para este gateway.")).toBeVisible();
});

test("falha ao carregar histórico permite atualizar e tentar novamente", async ({ page }) => {
  await mockGatewayEndpoints(page, { failOperationsOnce: true });
  await openDetails(page);
  await page.getByRole("button", { name: "Ver histórico de operações" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Atualizar" }).click();
  await expect(page.getByText("Atualizar configuração de rede", { exact: true })).toBeVisible();
});

test("histórico anuncia o carregamento enquanto a resposta está pendente", async ({ page }) => {
  await mockGatewayEndpoints(page, { delayOperations: true });
  await openDetails(page);
  await page.getByRole("button", { name: "Ver histórico de operações" }).click();

  await expect(page.getByRole("button", { name: "Atualizar" })).toBeDisabled();
  await expect(page.getByText("Atualizar configuração de rede", { exact: true })).toBeVisible();
});

test("renomeia o gateway e exige o nome exato para excluir", async ({ page }) => {
  await mockGatewayEndpoints(page);
  let savedName = "";
  let deletions = 0;
  await page.route("**/api/v1/gateways/24", async (route) => {
    switch (route.request().method()) {
      case "PATCH":
        savedName = route.request().postDataJSON().name;
        await route.fulfill({ json: { gateway: { ...gateway, name: savedName } } });
        break;
      case "DELETE":
        deletions += 1;
        await route.fulfill({ status: 204 });
        break;
      default:
        await route.fallback();
    }
  });
  await openDetails(page);

  await page.getByRole("button", { name: "Editar nome" }).click();
  const saveName = page.getByRole("button", { name: "Salvar nome" });
  await expect(saveName).toBeDisabled();
  await page.getByLabel("Nome do gateway", { exact: true }).fill(" Gateway QA ");
  await saveName.click();
  await expect(page.getByText("Nome atualizado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gateway QA" })).toBeVisible();
  expect(savedName).toBe("Gateway QA");

  await page.getByRole("button", { name: "Excluir gateway" }).click();
  const confirm = page.getByRole("button", { name: "Confirmar exclusão" });
  const name = page.getByLabel("Nome do gateway para confirmar exclusão");
  await name.fill(gateway.name);
  await expect(confirm).toBeDisabled();
  expect(deletions).toBe(0);
  await name.fill(savedName);
  await confirm.click();

  await expect(page).toHaveURL(/\/gateways\/?$/);
  expect(deletions).toBe(1);
});

test("valida e salva IP estático, aplica a configuração e acompanha a operação", async ({ page }) => {
  await mockGatewayEndpoints(page);
  const profile = {
    mode: "static",
    dhcpFallbackEnabled: false,
    staticIpAddress: "192.0.2.20",
    staticPrefixLength: 24,
    staticGateway: "192.0.2.1",
    primaryDns: "192.0.2.53",
    secondaryDns: null,
  };
  const queued = { ...firstOperation, id: 303, status: "pending", attempts: 0 };
  const completed = { ...queued, status: "applied", attempts: 1 };
  const saves: unknown[] = [];
  let applyRequests = 0;
  let operationReads = 0;
  await page.route("**/api/v1/gateways/24/ethernet", async (route) => {
    if (route.request().method() === "POST") {
      saves.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { ethernetConfig: { id: 42, ...profile } } });
      return;
    }
    await route.fulfill({ json: { ethernetConfigs: saves.length ? [{ id: 42, ...profile }] : [] } });
  });
  await page.route("**/api/v1/gateways/24/ethernet/apply", (route) => {
    expect(route.request().method()).toBe("POST");
    applyRequests += 1;
    return route.fulfill({ status: 202, json: { operation: queued } });
  });
  await page.route("**/api/v1/gateways/24/network-operations?*", (route) => {
    if (applyRequests === 0) return route.fallback();
    operationReads += 1;
    return route.fulfill({ json: { operations: [operationReads === 1 ? queued : completed] } });
  });
  await page.route("**/api/v1/gateways/24", (route) => route.fulfill({
    json: { gateway: operationReads >= 1 ? { ...gateway, name: "Gateway reconsultado" } : gateway },
  }));
  await openDetails(page);

  const apply = page.getByRole("button", { name: "Aplicar configuração" });
  const ip = page.getByLabel("Endereço IP estático");
  await expect(apply).toBeDisabled();
  await expect(ip).toHaveCount(0);
  await page.getByRole("button", { name: "IP estático" }).click();
  await expect(ip).toBeVisible();
  const save = page.getByRole("button", { name: "Salvar configuração" });
  const prefix = page.getByLabel("Prefixo de rede");
  const requiredFields = [
    { field: ip, value: profile.staticIpAddress },
    { field: prefix, value: String(profile.staticPrefixLength) },
    { field: page.getByLabel("Gateway da rede"), value: profile.staticGateway },
    { field: page.getByLabel("DNS primário", { exact: true }), value: profile.primaryDns },
  ];
  const alert = page.getByRole("alert");
  const validationMessage = "Informe IP, prefixo entre 1 e 32, gateway e DNS primário.";
  for (const { field, value } of requiredFields) {
    await field.fill(value);
  }
  for (const { field, value } of requiredFields) {
    await field.clear();
    await save.click();
    await expect(alert).toHaveText(validationMessage);
    await field.fill(value);
  }
  await prefix.fill("33");
  await save.click();
  await expect(alert).toHaveText(validationMessage);
  await prefix.fill(String(profile.staticPrefixLength));
  await expect(page.getByLabel("DNS secundário", { exact: true })).toHaveValue("");
  await save.click();
  await expect(page.getByText(/Configuração salva/)).toBeVisible();
  expect(saves).toEqual([profile]);
  await apply.click();
  await expect(page.getByText("Operação #303 aguardando na fila.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Configuração em processamento" })).toBeDisabled();
  await expect(page.getByText(/Operação #303.*aplicad/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Gateway reconsultado" })).toBeVisible();
  await expect(apply).toBeEnabled();
  expect(applyRequests).toBe(1);
});

test("limpa o DNS secundário de um perfil Ethernet salvo", async ({ page }) => {
  await mockGatewayEndpoints(page);
  let profile = {
    id: 42,
    mode: "static",
    dhcpFallbackEnabled: false,
    staticIpAddress: "192.0.2.20",
    staticPrefixLength: 24,
    staticGateway: "192.0.2.1",
    primaryDns: "192.0.2.53",
    secondaryDns: "192.0.2.54",
  };
  await page.route("**/api/v1/gateways/24/ethernet", (route) =>
    route.fulfill({ json: { ethernetConfigs: [profile] } }),
  );
  const updates: unknown[] = [];
  await page.route("**/api/v1/gateways/24/ethernet/42", (route) => {
    expect(route.request().method()).toBe("PUT");
    const payload = route.request().postDataJSON();
    updates.push(payload);
    profile = { ...profile, ...payload };
    return route.fulfill({ json: { ethernetConfig: profile } });
  });

  await openDetails(page);
  const secondaryDns = page.getByLabel("DNS secundário", { exact: true });
  await expect(secondaryDns).toHaveValue("192.0.2.54");
  await secondaryDns.clear();
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(page.getByText(/Configuração salva/)).toBeVisible();
  await expect(secondaryDns).toHaveValue("");
  expect(updates).toEqual([expect.objectContaining({ secondaryDns: null })]);
});

test("Ethernet DHCP só exige perfil estático quando o fallback está ligado", async ({ page }) => {
  await mockGatewayEndpoints(page);
  const saves: unknown[] = [];
  await page.route("**/api/v1/gateways/24/ethernet**", (route) => {
    if (route.request().method() === "GET") return route.fallback();
    const payload = route.request().postDataJSON();
    saves.push({ method: route.request().method(), payload });
    return route.fulfill({ json: { ethernetConfig: { id: 42, ...payload } } });
  });
  await openDetails(page);
  const fallback = page.getByLabel("Fallback DHCP", { exact: true });
  const ip = page.getByLabel("Endereço IP estático");
  const save = page.getByRole("button", { name: "Salvar configuração" });
  await expect(ip).toHaveCount(0);
  await save.click();
  await expect(page.getByText(/Configuração salva/)).toBeVisible();

  await fallback.click();
  await expect(ip).toBeVisible();
  await save.click();
  await expect(page.getByRole("alert")).toHaveText("Informe IP, prefixo entre 1 e 32, gateway e DNS primário.");
  await ip.fill("192.0.2.20");
  await page.getByLabel("Prefixo de rede").fill("24");
  await page.getByLabel("Gateway da rede").fill("192.0.2.1");
  await page.getByLabel("DNS primário", { exact: true }).fill("192.0.2.53");
  await save.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(/Configuração salva/)).toBeVisible();

  expect(saves).toEqual([
    {
      method: "POST",
      payload: { mode: "dhcp", dhcpFallbackEnabled: false, staticPrefixLength: 24, secondaryDns: null },
    },
    {
      method: "PUT",
      payload: {
        mode: "dhcp",
        dhcpFallbackEnabled: true,
        staticIpAddress: "192.0.2.20",
        staticPrefixLength: 24,
        staticGateway: "192.0.2.1",
        primaryDns: "192.0.2.53",
        secondaryDns: null,
      },
    },
  ]);
});

test("desliga o fallback DHCP com endereços IPv6 legados", async ({ page }) => {
  await mockGatewayEndpoints(page);
  const profile = {
    id: 42,
    mode: "dhcp",
    dhcpFallbackEnabled: true,
    staticIpAddress: "2001:db8::20",
    staticPrefixLength: 24,
    staticGateway: "2001:db8::1",
    primaryDns: "192.0.2.53",
  };
  await page.route("**/api/v1/gateways/24/ethernet", (route) =>
    route.fulfill({ json: { ethernetConfigs: [profile] } }),
  );
  const updates: unknown[] = [];
  await page.route("**/api/v1/gateways/24/ethernet/42", (route) => {
    expect(route.request().method()).toBe("PUT");
    const payload = route.request().postDataJSON();
    updates.push(payload);
    return route.fulfill({ json: { ethernetConfig: { ...profile, ...payload } } });
  });

  await openDetails(page);
  const ip = page.getByLabel("Endereço IP estático");
  const gatewayAddress = page.getByLabel("Gateway da rede");
  await expect(ip).toHaveValue(profile.staticIpAddress);
  await expect(gatewayAddress).toHaveValue(profile.staticGateway);
  await page.getByLabel("Fallback DHCP", { exact: true }).click();
  await expect(ip).toHaveCount(0);
  await expect(gatewayAddress).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(page.getByText(/Configuração salva/)).toBeVisible();
  expect(updates).toEqual([expect.objectContaining({ mode: "dhcp", dhcpFallbackEnabled: false })]);
  expect(updates[0]).not.toHaveProperty("staticIpAddress");
  expect(updates[0]).not.toHaveProperty("staticGateway");
});

test("apresenta alerta de segurança e confirma reconhecimento", async ({ page }) => {
  await mockGatewayEndpoints(page);
  const alert = { id: 51, type: "Alerta QA", message: "O gateway reportou um incidente.", status: "open" };
  await page.route("**/api/v1/gateways/24/security-alerts?*", (route) => (
    route.fulfill({ json: { alerts: [alert] } })
  ));
  await page.route("**/api/v1/gateways/24/security-alerts/51/acknowledge", (route) => (
    route.fulfill({ json: { alert: { ...alert, status: "acknowledged" } } })
  ));
  await openDetails(page);

  await expect(page.getByText(alert.message)).toBeVisible();
  await expect(page.getByText("open", { exact: true })).toBeVisible();
  const requested = page.waitForRequest("**/security-alerts/51/acknowledge");
  await page.getByRole("button", { name: "Reconhecer" }).click();
  expect((await requested).method()).toBe("POST");
  await expect(page.getByText("acknowledged", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconhecer" })).toHaveCount(0);
});
