const configuredPort = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);

if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
  throw new RangeError('PORT must be a whole number between 1 and 65535.');
}

export const port = configuredPort;