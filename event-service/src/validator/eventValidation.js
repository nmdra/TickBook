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


  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateEventCreate,
};
