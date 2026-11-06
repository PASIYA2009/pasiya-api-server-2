import api from './system/router.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api.fetch(request, env);
    return env.ASSETS.fetch(request);
  }
};
