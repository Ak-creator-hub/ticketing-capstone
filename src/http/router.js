export class Router {
  #routes = [];

  add(method, path, handler) {
    if (typeof method !== 'string' || typeof path !== 'string' || typeof handler !== 'function') {
      throw new TypeError('A route requires a method, path, and handler.');
    }
    if (!path.startsWith('/')) {
      throw new TypeError('Route paths must start with /.');
    }

    const segments = path.split('/').slice(1);
    const parameterNames = segments.map((segment) => segment.startsWith(':') ? segment.slice(1) : null);
    if (parameterNames.some((name) => name === '')) {
      throw new TypeError('Route parameters must have a name.');
    }
    this.#routes.push({ method: method.toUpperCase(), segments, parameterNames, handler });
    return this;
  }

  match(method, path) {
    const segments = path.split(/[?#]/, 1)[0].split('/').slice(1);
    for (const route of this.#routes) {
      if (route.method !== method.toUpperCase() || route.segments.length !== segments.length) {
        continue;
      }

      const params = {};
      let matches = true;
      for (let index = 0; index < segments.length; index += 1) {
        const parameterName = route.parameterNames[index];
        if (parameterName === null) {
          if (route.segments[index] !== segments[index]) {
            matches = false;
            break;
          }
          continue;
        }
        try {
          params[parameterName] = decodeURIComponent(segments[index]);
        } catch {
          matches = false;
          break;
        }
      }
      if (matches) return { handler: route.handler, params };
    }
    return null;
  }
}