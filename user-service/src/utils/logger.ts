const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
} as const;

const colorize = (color: keyof typeof COLORS, message: string): string => {
  return `${COLORS[color]}${message}${COLORS.reset}`;
};

export const logger = {
  success: (message: string): void => {
    console.log(colorize('green', message));
  },
  info: (message: string): void => {
    console.log(colorize('cyan', message));
  },
  warn: (message: string): void => {
    console.warn(colorize('yellow', message));
  },
  error: (message: string): void => {
    console.error(colorize('red', message));
  },
  highlight: (message: string): void => {
    console.log(colorize('magenta', message));
  },
};
