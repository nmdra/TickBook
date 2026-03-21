/**
 * Validates event creation payload
 * @param {object} data - Event data to validate
 * @returns {object} - { valid: boolean, errors: string[] }
 */
const validateEventCreate = (data) => {
  const errors = [];

  // Title validation
  if (!data.title) {
    errors.push('Title is required');
  } else if (typeof data.title !== 'string') {
    errors.push('Title must be a string');
  } else if (data.title.trim().length === 0) {
    errors.push('Title cannot be empty');
  } else if (data.title.length > 255) {
    errors.push('Title cannot exceed 255 characters');
  }

  // Date validation
  if (!data.date) {
    errors.push('Date is required');
  } else {
    const eventDate = new Date(data.date);
    if (isNaN(eventDate.getTime())) {
      errors.push('Date must be a valid ISO 8601 date');
    } else if (eventDate < new Date()) {
      errors.push('Event date cannot be in the past');
    }
  }

  // Total tickets validation
  if (data.total_tickets === undefined || data.total_tickets === null) {
    errors.push('Total tickets is required');
  } else if (!Number.isInteger(data.total_tickets)) {
    errors.push('Total tickets must be an integer');
  } else if (data.total_tickets <= 0) {
    errors.push('Total tickets must be greater than 0');
  } else if (data.total_tickets > 1000000) {
    errors.push('Total tickets cannot exceed 1,000,000');
  }

  // Price validation
  if (data.price === undefined || data.price === null) {
    errors.push('Price is required');
  } else if (typeof data.price !== 'number') {
    errors.push('Price must be a number');
  } else if (data.price <= 0) {
    errors.push('Price must be greater than 0');
  } else if (data.price > 999999.99) {
    errors.push('Price cannot exceed 999,999.99');
  }

  // Optional: Description validation


  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateEventCreate,
};
