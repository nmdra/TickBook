const { pool } = require('../config/db');
const { getRedis } = require('../config/redis');
const { publishEvent } = require('../config/kafka');
const { validateEventCreate } = require('../validator/eventValidation');
const logger = require('../config/logger');

const CACHE_TTL = 60;

const getAllEvents = async (req, res) => {
  try {
    const redis = getRedis();

    if (redis) {
      try {
        const cached = await redis.get('events:all');
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (err) {
        logger.warn('Redis read error:', err.message);
      }
    }

    const result = await pool.query('SELECT * FROM events ORDER BY date ASC');

    if (redis) {
      try {
        await redis.set('events:all', JSON.stringify(result.rows), 'EX', CACHE_TTL);
      } catch (err) {
        logger.warn('Redis write error:', err.message);
      }
    }

    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching events:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const redis = getRedis();

    if (redis) {
      try {
        const cached = await redis.get(`events:${id}`);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (err) {
        logger.warn('Redis read error:', err.message);
      }
    }

    const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found:' });
    }

    if (redis) {
      try {
        await redis.set(`events:${id}`, JSON.stringify(result.rows[0]), 'EX', CACHE_TTL);
      } catch (err) {
        logger.warn('Redis write error:', err.message);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Error fetching event:', err.message);
    res.status(500).json({ error: 'Internal server error:' });
  }
};

const createEvent = async (req, res) => {
  try {
    const { title, description, venue, date, total_tickets, price } = req.body;

    // Validate input
    const validation = validateEventCreate(req.body);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: validation.errors 
      });
    }

    const result = await pool.query(
      `INSERT INTO events (title, description, venue, date, total_tickets, available_tickets, price)
       VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING *`,
      [title, description || null, venue || null, date, total_tickets, price]
    );

    const event = result.rows[0];

    // Invalidate list cache
    const redis = getRedis();
    if (redis) {
      try {
        await redis.del('events:all');
      } catch (err) {
        logger.warn('Redis invalidation error:', err.message);
      }
    }

    await publishEvent('events', 'event.created', event);

    res.status(201).json(event);
  } catch (err) {
    logger.error('Error creating event:', err.message);
    res.status(500).json({ error: 'Internal server error:' });
  }
};

const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, venue, date, total_tickets, available_tickets, price } = req.body;

    const existing = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found:' });
    }

    const newTotalTickets = total_tickets !== undefined ? total_tickets : existing.rows[0].total_tickets;
    const newAvailableTickets = available_tickets !== undefined ? available_tickets : existing.rows[0].available_tickets;
    const newPrice = price !== undefined ? price : existing.rows[0].price;

    if (newTotalTickets <= 0 || newPrice <= 0) {
      return res.status(400).json({ error: 'total_tickets and price must be positive numbers' });
    }

    if (newAvailableTickets < 0) {
      return res.status(400).json({ error: 'available_tickets must not be negative' });
    }

    if (newAvailableTickets > newTotalTickets) {
      return res.status(400).json({ error: 'available_tickets must not exceed total_tickets' });
    }

    const result = await pool.query(
      `UPDATE events SET title = $1, description = $2, venue = $3, date = $4,
       total_tickets = $5, available_tickets = $6, price = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        title !== undefined ? title : existing.rows[0].title,
        description !== undefined ? description : existing.rows[0].description,
        venue !== undefined ? venue : existing.rows[0].venue,
        date !== undefined ? date : existing.rows[0].date,
        newTotalTickets,
        newAvailableTickets,
        newPrice,
        id,
      ]
    );

    const event = result.rows[0];

    const redis = getRedis();
    if (redis) {
      try {
        await redis.del('events:all', `events:${id}`);
      } catch (err) {
        logger.warn('Redis invalidation error:', err.message);
      }
    }

    await publishEvent('events', 'event.updated', event);

    res.json(event);
  } catch (err) {
    logger.error('Error updating event:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const redis = getRedis();
    if (redis) {
      try {
        await redis.del('events:all', `events:${id}`);
      } catch (err) {
        logger.warn('Redis invalidation error:', err.message);
      }
    }

    await publishEvent('events', 'event.deleted', { id });

    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    logger.error('Error deleting event:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const checkAvailability = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT id, title, available_tickets, total_tickets FROM events WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = result.rows[0];

    res.json({
      id: event.id,
      title: event.title,
      available_tickets: event.available_tickets,
      total_tickets: event.total_tickets,
      is_available: event.available_tickets > 0,
    });
  } catch (err) {
    logger.error('Error checking availability:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  checkAvailability,
};
