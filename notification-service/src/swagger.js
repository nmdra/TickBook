const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TickBook Notification Service API',
      version: '1.0.0',
      description: 'Health endpoints for notification router/workers',
    },
    servers: [{ url: 'http://localhost:3005' }],
  },
  apis: ['./src/index.js'],
};

module.exports = swaggerJSDoc(options);
