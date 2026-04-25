const { pool } = require('../config/db');
const { getRedis } = require('../config/redis');
const { publishEvent } = require('../config/kafka');
const { validateEventCreate, validateEventUpdate } = require('../validator/eventValidation');
const logger = require('../config/logger');

const CACHE_TTL = 60;

const invalidateUpcomingCaches = async (redis) => {
  if (!redis) {
    return;
  }

  try {
    const keys = await redis.keys('events:upcoming:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.warn('Redis invalidation error:', err.message);
  }
};

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

const getUpcomingEvents = async (req, res) => {
  try {
    const {
      limit: limitParam,
      offset: offsetParam,
      from,
      to,
      venue,
      min_price: minPriceParam,
      max_price: maxPriceParam,
    } = req.query;

    const limit = limitParam === undefined ? 20 : parseInt(limitParam, 10);
    const offset = offsetParam === undefined ? 0 : parseInt(offsetParam, 10);

    if (Number.isNaN(limit) || limit <= 0 || limit > 100) {
      return res.status(400).json({ error: 'limit must be an integer between 1 and 100' });
    }

    if (Number.isNaN(offset) || offset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    if (from && Number.isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: 'from must be a valid ISO 8601 date-time' });
    }

    if (to && Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'to must be a valid ISO 8601 date-time' });
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ error: 'from must be earlier than or equal to to' });
    }

    const minPrice = minPriceParam === undefined ? null : Number(minPriceParam);
    const maxPrice = maxPriceParam === undefined ? null : Number(maxPriceParam);

    if (minPriceParam !== undefined && (Number.isNaN(minPrice) || minPrice < 0)) {
      return res.status(400).json({ error: 'min_price must be a number greater than or equal to 0' });
    }

    if (maxPriceParam !== undefined && (Number.isNaN(maxPrice) || maxPrice < 0)) {
      return res.status(400).json({ error: 'max_price must be a number greater than or equal to 0' });
    }

    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      return res.status(400).json({ error: 'min_price must be less than or equal to max_price' });
    }

    const normalizedVenue = venue && typeof venue === 'string' ? venue.trim() : '';

    const cacheKey = [
      'events:upcoming',
      `limit:${limit}`,
      `offset:${offset}`,
      `from:${from || ''}`,
      `to:${to || ''}`,
      `venue:${normalizedVenue}`,
      `min_price:${minPriceParam ?? ''}`,
      `max_price:${maxPriceParam ?? ''}`,
    ].join(':');

    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (err) {
        logger.warn('Redis read error:', err.message);
      }
    }

    const conditions = ['date >= NOW()'];
    const values = [];

    if (fromDate) {
      values.push(fromDate.toISOString());
      conditions.push(`date >= $${values.length}`);
    }

    if (toDate) {
      values.push(toDate.toISOString());
      conditions.push(`date <= $${values.length}`);
    }

    if (normalizedVenue) {
      values.push(`%${normalizedVenue}%`);
      conditions.push(`venue ILIKE $${values.length}`);
    }

    if (minPrice !== null) {
      values.push(minPrice);
      conditions.push(`price >= $${values.length}`);
    }

    if (maxPrice !== null) {
      values.push(maxPrice);
      conditions.push(`price <= $${values.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `SELECT COUNT(*)::int AS total FROM events WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = countResult.rows[0].total;

    const queryValues = [...values, limit, offset];
    const eventsQuery = `
      SELECT *
      FROM events
      WHERE ${whereClause}
      ORDER BY date ASC
      LIMIT $${queryValues.length - 1}
      OFFSET $${queryValues.length}
    `;
    const eventsResult = await pool.query(eventsQuery, queryValues);

    const payload = {
      data: eventsResult.rows,
      pagination: {
        total,
        limit,
        offset,
        count: eventsResult.rows.length,
        has_more: offset + eventsResult.rows.length < total,
      },
      filters: {
        from: from || null,
        to: to || null,
        venue: normalizedVenue || null,
        min_price: minPrice,
        max_price: maxPrice,
      },
    };

    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL);
      } catch (err) {
        logger.warn('Redis write error:', err.message);
      }
    }

    return res.json(payload);
  } catch (err) {
    logger.error('Error fetching upcoming events:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getEventsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const parsedUserId = parseInt(userId, 10);

    if (Number.isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({ error: 'userId must be a positive integer' });
    }

    const redis = getRedis();
    const cacheKey = `events:user:${parsedUserId}`;

    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (err) {
        logger.warn('Redis read error:', err.message);
      }
    }

    const result = await pool.query('SELECT * FROM events WHERE user_id = $1 ORDER BY date ASC', [parsedUserId]);

    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(result.rows), 'EX', CACHE_TTL);
      } catch (err) {
        logger.warn('Redis write error:', err.message);
      }
    }

    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching events by userId:', err.message);
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
      return res.status(404).json({ error: 'Event not found' });
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
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createEvent = async (req, res) => {
  try {
    const { title, description, venue, date, total_tickets, price, user_id } = req.body;

    // Validate input
    const validation = validateEventCreate(req.body);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: validation.errors 
      });
    }

    const result = await pool.query(
      `INSERT INTO events (title, description, venue, date, total_tickets, available_tickets, price, user_id)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7) RETURNING *`,
      [title, description || null, venue || null, date, total_tickets, price, user_id || null]
    );

    const event = result.rows[0];

    // Invalidate list cache
    const redis = getRedis();
    if (redis) {
      try {
        await redis.del('events:all');
        if (event.user_id) {
          await redis.del(`events:user:${event.user_id}`);
        }
        await invalidateUpcomingCaches(redis);
      } catch (err) {
        logger.warn('Redis invalidation error:', err.message);
      }
    }

    await publishEvent('events', 'event.created', event);

    res.status(201).json(event);
  } catch (err) {
    logger.error('Error creating event:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, venue, date, total_tickets, available_tickets, price, user_id } = req.body;

    const validation = validateEventUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    const existing = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const newTotalTickets = total_tickets !== undefined ? total_tickets : existing.rows[0].total_tickets;
    const newAvailableTickets = available_tickets !== undefined ? available_tickets : existing.rows[0].available_tickets;
    const newPrice = price !== undefined ? price : existing.rows[0].price;
    const newUserId = user_id !== undefined ? user_id : existing.rows[0].user_id;

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
       total_tickets = $5, available_tickets = $6, price = $7, user_id = $8, updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [
        title !== undefined ? title : existing.rows[0].title,
        description !== undefined ? description : existing.rows[0].description,
        venue !== undefined ? venue : existing.rows[0].venue,
        date !== undefined ? date : existing.rows[0].date,
        newTotalTickets,
        newAvailableTickets,
        newPrice,
        newUserId,
        id,
      ]
    );

    const event = result.rows[0];

    const redis = getRedis();
    if (redis) {
      try {
        await redis.del('events:all', `events:${id}`);
        if (existing.rows[0].user_id) {
          await redis.del(`events:user:${existing.rows[0].user_id}`);
        }
        if (event.user_id) {
          await redis.del(`events:user:${event.user_id}`);
        }
        await invalidateUpcomingCaches(redis);
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
      return res.status(404).json({ error: 'Event not found.' });
    }

    const redis = getRedis();
    if (redis) {
      try {
        await redis.del('events:all', `events:${id}`);
        if (result.rows[0].user_id) {
          await redis.del(`events:user:${result.rows[0].user_id}`);
        }
        await invalidateUpcomingCaches(redis);
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
      return res.status(404).json({ error: 'Event not found.' });
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
  getUpcomingEvents,
  getEventsByUserId,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  checkAvailability,
};
