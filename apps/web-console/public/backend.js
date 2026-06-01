export const workbenchBackend = createHttpBackend();

function createHttpBackend() {
  return {
    kind: "http",
    async request(path, options = {}) {
      const response = await fetch(path, {
        method: options.method || "GET",
        headers: {
          "content-type": "application/json"
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      const operationId = response.headers.get("x-typecho-operation-id");
      return {
        ok: response.ok,
        statusText: response.statusText,
        operationId,
        data
      };
    }
  };
}
