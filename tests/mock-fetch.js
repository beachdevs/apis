globalThis.fetch = async (url, init = {}) => {
  const method = init.method ?? 'GET';
  const payload = {
    url: String(url),
    method,
    body: init.body ?? null
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Mock-Fetch': '1'
    }
  });
};
