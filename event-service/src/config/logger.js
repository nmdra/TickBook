const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.splat(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [new transports.Console()],
});

module.exports = logger;