// Jest setup and tests included in one file for brevity
import { rest, ResponseResolver, MockedRequest, restContext } from "msw";
import OpenAPIBackend, { Context } from "openapi-backend";
import { setupServer } from "msw/node";
import definition from "./swagger.json";
// Polyfill for fetch since Jest doesn't include it
import "whatwg-fetch";

/**
 * Types
 */
type WorkerParams = Parameters<
  ResponseResolver<MockedRequest, typeof restContext>
>;

type RegistrationParams = [
  openAPICtx: Context,
  req: WorkerParams[0],
  res: WorkerParams[1],
  ctx: WorkerParams[2]
];

/**
 * Setup mocks via openapi-backend
 * View full set of options here: https://github.com/anttiviljami/openapi-backend/blob/master/DOCS.md#new-openapibackendopts
 */
const apiRoot = "/api";
const api = new OpenAPIBackend({
  // Issues with OpenAPIBackend type and output from swagger-cli
  // @ts-ignore
  definition,
  apiRoot,
});

/**
 * MSW / OpenAPIBackend Integration
 */
api.register("notFound", (...[, , res, ctx]: RegistrationParams) =>
  // If a request is made that isn't in the swagger docs return a 404
  res(ctx.status(404))
);

api.register(
  "notImplemented",
  (...[openAPICtx, , res, ctx]: RegistrationParams) => {
    // Since no requests are registered all endpoints in the
    // swagger docs will fall through to this function.
    const { status, mock } = openAPICtx.api.mockResponseForOperation(
      openAPICtx.operation.operationId ?? ""
    );

    return res(ctx.status(status), ctx.json(mock));
  }
);

/**
 * MSW Mocks
 */
const mockResponse = (...[req, res, ctx]: WorkerParams) => {
  const { method, url, headers: headersRaw, body } = req;
  const path = url.pathname;
  const headers = headersRaw.all();

  const requestConfig = { method, path, headers, body };
  return api.handleRequest(requestConfig, req, res, ctx);
};

const mocks = [rest.get(/api/, mockResponse), rest.post(/api/, mockResponse)];

/**
 * Jest Setup
 */
const server = setupServer(...mocks);

beforeAll(async () => {
  // Initialize OpenAPIBackend
  await api.init();

  // Start MSW
  server.listen();
});

// Reset MSW mocks between tests
afterEach(server.resetHandlers);

// Stop MSW
afterAll(server.close);

/**
 * Tests
 */

// Request wrapper to make tests more concise
async function request(url: string, method = "GET") {
  const response = await window.fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
  });

  switch (response.status) {
    case 200:
    case 201:
      return await response.json();
    case 404:
      return { error: "No matching endpoint" };
    default:
      throw new Error(`Unexpected response ${response}`);
  }
}

test("should return a list of users based on the example in the swagger docs", async () => {
  const users = await request("/api/users");
  expect(users).toEqual(["Tim", "Tam"]);
});

test("should create a user and return id based on the example in the swagger docs", async () => {
  const userInfo = await request("/api/users", "POST");
  expect(userInfo).toEqual({ id: 1 });
});

test("should return a 404 if a request is made to an endpoint which is not in the swagger docs", async () => {
  const error = await request("/api/some-other-endpoint");
  expect(error).toEqual({ error: "No matching endpoint" });
});
