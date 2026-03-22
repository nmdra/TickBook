const { Kafka } = require('kafkajs');

let producer = null;
let isConnecting = false;
let isConnected = false;
let isShuttingDown = false;
let reconnectTimer = null;

const reconnectIntervalMs =
  parseInt(process.env.KAFKA_RECONNECT_INTERVAL_MS || '', 10) || 15000;

const clearReconnectTimer = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const scheduleReconnect = () => {
  if (isShuttingDown || isConnecting || isConnected || reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectProducer().catch((err) => {
      console.warn('Kafka producer reconnect failed:', err.message);
    });
  }, reconnectIntervalMs);

  console.warn(`Kafka producer unavailable. Retrying connection in ${reconnectIntervalMs}ms.`);
};

const connectProducer = async () => {
  if (isShuttingDown || isConnecting || isConnected) {
    return producer;
  }

  isConnecting = true;
  clearReconnectTimer();

  try {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const kafka = new Kafka({
      clientId: 'event-service',
      brokers,
      retry: { retries: 3 },
    });

    producer = kafka.producer();
    await producer.connect();
    isConnected = true;
    console.log('Connected to Kafka');
  } catch (err) {
    console.warn('Failed to connect to Kafka:', err.message);
    producer = null;
    isConnected = false;
    scheduleReconnect();
  } finally {
    isConnecting = false;
  }

  return producer;
};

const publishEvent = async (topic, key, message) => {
  if (!producer || !isConnected) {
    console.warn('Kafka producer not available, skipping publish');
    scheduleReconnect();
    return;
  }

  try {
    await producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(message) }],
    });
  } catch (err) {
    console.warn('Failed to publish Kafka message:', err.message);
    isConnected = false;
    scheduleReconnect();
  }
};

const disconnectKafka = async () => {
  isShuttingDown = true;
  isConnected = false;
  clearReconnectTimer();

  if (producer) {
    try {
      await producer.disconnect();
    } catch (err) {
      console.warn('Error disconnecting Kafka:', err.message);
    }
  }
};

module.exports = { connectProducer, publishEvent, disconnectKafka };
