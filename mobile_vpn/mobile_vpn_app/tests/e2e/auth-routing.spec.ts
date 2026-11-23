import { expect, test, type Page, type Route } from "@playwright/test";

const gateways = [
  {
    id: 24,
    name: "Gateway Central",
    status: "online",
    managementIpAddress: "10.200.0.2",
    wanIpAddress: "198.51.100.10",
  },
  {
    id: 25,
    name: "Gateway Filial",
    status: "offline",
    managementIpAddress: "10.200.0.3",
    wanIpAddress: null,
  },
];

function gatewayListBody(items = gateways) {
  const online = items.filter((gateway) => gateway.status === "online").length;
  return {
    gatewaysList: items,
    meta: { total: items.length, currentPage: 1, lastPage: 1 },
    summary: { total: items.length, online, offline: items.length - online },
  };
}

async function mockLogin(page: Page, options: { isAdmin?: boolean; status?: number } = {}) {
  await page.route("**/auth/login", (route: Route) =>
    route.fulfill({
      status: options.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(
        options.status && options.status >= 400
          ? { errors: [{ message: "E-mail ou senha inválidos." }] }
          : {
              data: {
                token: "e2e-test-token",
                user: {
                  id: 1,
                  email: "qa@example.test",
                  fullName: "Equipe QA",
                  isAdmin: options.isAdmin ?? true,
                },
              },
            },
      ),
    }),
  );
}

async function signIn(page: Page) {
  await page.getByLabel("E-mail").fill("qa@example.test");
  await page.getByRole("textbox", { name: "Senha" }).fill("e2e-test-password");
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function mockGatewayList(page: Page, respond: (route: Route) => Promise<void>) {
  await page.route("**/gateways?*", respond);
}

async function openGatewayList(page: Page, isAdmin = true) {
  await page.goto("/login");
  await mockLogin(page, { isAdmin });
  await signIn(page);
  await expect(page).toHaveURL(/\/gateways\/?$/);
  await expect(page.getByRole("heading", { name: "Gateways" })).toBeVisible();
}

test("sessão ausente apresenta o formulário de login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("E-mail")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("textbox", { name: "Senha" })).toBeVisible();
});

test("login administrativo abre a lista carregada de gateways", async ({ page }) => {
  await mockGatewayList(page, (route) => route.fulfill({ json: gatewayListBody() }));
  await openGatewayList(page);

  await expect(page.getByText("Gateway Central")).toBeVisible();
  await expect(page.getByText("Gateway Filial")).toBeVisible();
  await expect(page.getByText("1 online")).toBeVisible();
  await expect(page.getByText("1 offline")).toBeVisible();
  await expect(page.getByText("2 resultados")).toBeVisible();
});

test("login exige e-mail e senha e preserva a senha enviada", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("**/auth/login", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      status: 401,
      json: { errors: [{ message: "E-mail ou senha inválidos." }] },
    });
  });
  await page.goto("/login");
  const email = page.getByLabel("E-mail", { exact: true });
  const password = page.getByLabel("Senha", { exact: true });
  const submit = page.getByRole("button", { name: "Entrar" });
  await expect(submit).toBeDisabled();
  await email.fill("  qa@example.test  ");
  await expect(submit).toBeDisabled();
  await password.fill("   ");
  await expect(submit).toBeDisabled();
  await email.clear();
  await password.fill("  e2e-password-with-spaces  ");
  await expect(submit).toBeDisabled();
  await email.fill("  qa@example.test  ");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
  expect(requests).toEqual([{ email: "qa@example.test", password: "  e2e-password-with-spaces  " }]);
});

test("login inválido mostra erro e mantém o formulário aberto", async ({ page }) => {
  await page.goto("/login");
  await mockLogin(page, { status: 401 });
  await signIn(page);

  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

test("login exibe mensagem simples retornada pela API", async ({ page }) => {
  await page.route("**/auth/login", (route) =>
    route.fulfill({ status: 403, json: { message: "Conta temporariamente bloqueada." } }),
  );
  await page.goto("/login");
  await signIn(page);

  await expect(page.getByRole("alert")).toHaveText("Conta temporariamente bloqueada.");
});

test("conta sem permissão administrativa recebe acesso restrito", async ({ page }) => {
  await page.goto("/login");
  await mockLogin(page, { isAdmin: false });
  await signIn(page);

  await expect(page).toHaveURL(/\/access-denied\/?$/);
  await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
});

test("lista vazia explica que ainda não há gateways cadastrados", async ({ page }) => {
  await mockGatewayList(page, (route) => route.fulfill({ json: gatewayListBody([]) }));
  await openGatewayList(page);

  await expect(page.getByText("Nenhum gateway cadastrado")).toBeVisible();
  await expect(page.getByText("0 resultados")).toBeVisible();
});

test("falha ao carregar gateways permite tentar novamente", async ({ page }) => {
  let requests = 0;
  await mockGatewayList(page, async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ errors: [{ message: "Serviço temporariamente indisponível." }] }),
      });
      return;
    }
    await route.fulfill({ json: gatewayListBody() });
  });
  await openGatewayList(page);

  await expect(page.getByRole("alert")).toHaveText("Serviço temporariamente indisponível.");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Gateway Central")).toBeVisible();
  expect(requests).toBe(2);
});

test("senha começa oculta e pode ser exibida e ocultada", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Senha", { exact: true });
  await password.fill("e2e-test-password");
  await expect(password).toHaveJSProperty("type", "password");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(password).toHaveJSProperty("type", "text");
  await expect(password).toHaveValue("e2e-test-password");
  await page.getByRole("button", { name: "Ocultar senha" }).click();
  await expect(password).toHaveJSProperty("type", "password");
});

test("recarregar o app exige login e limpa a sessão legada", async ({ page }) => {
  await mockLogin(page);
  await page.route("**/gateways?*", (route) => route.fulfill({ json: gatewayListBody() }));
  await page.goto("/login");
  await signIn(page);
  await expect(page).toHaveURL(/\/gateways\/?$/);

  await page.evaluate(() => localStorage.setItem("browan.session", "legacy-test-session"));
  await page.reload();

  await expect(page).toHaveURL(/\/login\/?$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("browan.session"))).toBeNull();
});

test("resposta 401 na lista encerra a sessão e pede novo login", async ({ page }) => {
  await mockLogin(page);
  let authenticatedRequest = false;
  await page.route("**/gateways?*", (route) => {
    authenticatedRequest = route.request().headers()["authorization"] === "Bearer e2e-test-token";
    return route.fulfill({ status: 401, json: { errors: [{ message: "Sessão expirada." }] } });
  });
  await page.goto("/login");
  await signIn(page);

  await expect.poll(() => authenticatedRequest).toBe(true);
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

for (const account of [
  { isAdmin: true, destination: /\/gateways\/?$/, button: "SAIR", type: "administradora" },
  { isAdmin: false, destination: /\/access-denied\/?$/, button: "Sair da conta", type: "restrita" },
]) {
  test(`conta ${account.type} revoga a sessão e volta ao login ao sair`, async ({ page }) => {
    await mockLogin(page, { isAdmin: account.isAdmin });
    await page.route("**/gateways?*", (route) => route.fulfill({ json: gatewayListBody() }));
    await page.route("**/account/logout", (route) => route.fulfill({ status: 204 }));
    await page.goto("/login");
    await signIn(page);
    await expect(page).toHaveURL(account.destination);

    const revoked = page.waitForRequest("**/account/logout");
    await page.getByRole("button", { name: account.button, exact: true }).click();
    const request = await revoked;
    expect(request.method()).toBe("POST");
    expect(request.headers()["authorization"]).toBe("Bearer e2e-test-token");
    await expect(page).toHaveURL(/\/login\/?$/);
  });
}

test("lista pesquisa por nome e filtra gateways por situação", async ({ page }) => {
  await mockLogin(page);
  await page.route("**/gateways?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const query = params.get("q")?.toLowerCase() ?? "";
    const status = params.get("status");
    const matches = gateways.filter((gateway) => (
      gateway.name.toLowerCase().includes(query) && (!status || gateway.status === status)
    ));
    return route.fulfill({ json: gatewayListBody(matches) });
  });
  await page.goto("/login");
  await signIn(page);
  await expect(page.getByText("Gateway Central", { exact: true })).toBeVisible();
  await expect(page.getByText("Gateway Filial", { exact: true })).toBeVisible();

  const search = page.getByLabel("Buscar gateways por nome ou IP");
  const searched = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/gateways") && url.searchParams.get("q") === "Central";
  });
  await search.fill("Central");
  await searched;
  await expect(page.getByText("Gateway Filial", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Gateway Central", { exact: true })).toBeVisible();

  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/gateways") && url.searchParams.get("status") === "offline" &&
      !url.searchParams.has("q") && url.searchParams.get("page") === "1";
  });
  await search.clear();
  await page.getByRole("button", { name: "Offline", exact: true }).click();
  await filtered;
  await expect(page.getByText("Gateway Filial", { exact: true })).toBeVisible();
  await expect(page.getByText("Gateway Central", { exact: true })).toHaveCount(0);
});

test("lista navega entre páginas e atualiza a página aberta", async ({ page }) => {
  await mockLogin(page);
  let refresh = false;
  await page.route("**/gateways?*", (route) => {
    const currentPage = Number(new URL(route.request().url()).searchParams.get("page"));
    const gateway = currentPage === 1 ? gateways[0] : gateways[1];
    const items = [{ ...gateway, name: refresh ? "Gateway Filial atualizado" : gateway.name }];
    return route.fulfill({
      json: { ...gatewayListBody(items), meta: { total: 21, currentPage, lastPage: 2 } },
    });
  });
  await page.goto("/login");
  await signIn(page);

  const previous = page.getByRole("button", { name: "Página anterior de gateways" });
  const next = page.getByRole("button", { name: "Próxima página de gateways" });
  await expect(page.getByText("Página 1 de 2")).toBeVisible();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  await expect(page.getByText("Gateway Filial", { exact: true })).toBeVisible();
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(page.getByText("Gateway Central", { exact: true })).toBeVisible();
  await next.click();
  await expect(page.getByText("Gateway Filial", { exact: true })).toBeVisible();

  refresh = true;
  await page.getByRole("button", { name: "Atualizar gateways" }).click();
  await expect(page.getByText("Gateway Filial atualizado", { exact: true })).toBeVisible();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
});
