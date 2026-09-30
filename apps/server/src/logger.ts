import pino from 'pino';
import { redactSecrets } from '@likec4-ai/core-domain';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Маскирует всё, что похоже на секрет, до того как оно попадёт в лог.
 * Это единая точка соблюдения НФТ1 (секреты никогда не должны попадать в
 * логи) — не полагается на то, что каждый вызывающий код сам не забудет
 * вычистить свои аргументы.
 */
const SECRET_PATHS = [
  '*.apiKey',
  '*.api_key',
  '*.token',
  '*.password',
  '*.pat',
  '*.secret',
  '*.authorization',
  'req.headers.authorization',
];

/**
 * `redact` выше матчит только ИМЕНА полей — но pino автоматически
 * разворачивает любой объект с ключом `err` через свой дефолтный
 * error-сериализатор (message/stack как есть), и `redact` этот путь не
 * перехватывает. Собственный сериализатор — вторая линия защиты по
 * СОДЕРЖИМОМУ текста (`redactSecrets`, Milestone 12): если секрет когда-либо
 * окажется внутри текста исключения (сегодня — не окажется, все адаптеры на
 * это протестированы), он всё равно не долетит до лога в открытом виде.
 */
function redactedErrorSerializer(err: unknown) {
  if (!(err instanceof Error)) return { message: redactSecrets(String(err)) };
  return {
    type: err.constructor?.name,
    message: redactSecrets(err.message),
    stack: err.stack ? redactSecrets(err.stack) : undefined,
  };
}

/**
 * Технический лог: одна строка на стадию pipeline / обращение к внешнему
 * API, с длительностью и деталями ошибки — для отладки, никогда не
 * показывается пользователю как есть. Отдельный инстанс от user-facing
 * лога, чтобы эти два потока никогда случайно не смешались.
 */
export function createTechnicalLogger() {
  return pino({
    name: 'technical',
    level: process.env.LOG_LEVEL ?? 'info',
    redact: { paths: SECRET_PATHS, censor: '[REDACTED]' },
    serializers: { err: redactedErrorSerializer },
    transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  });
}

/**
 * Лог пользовательских событий: записи на понятном языке
 * ("Спецификация прочитана"), без стектрейсов и внутреннего жаргона.
 * Начиная с Milestone 5 эти события также будут добавляться в
 * SessionRecord.userFacingTimeline для экрана History; этот логгер —
 * инфраструктурный аналог того же принципа.
 */
export function createUserFacingLogger() {
  return pino({
    name: 'user-facing',
    level: 'info',
    transport: isDev ? { target: 'pino-pretty', options: { ignore: 'pid,hostname,name', colorize: true } } : undefined,
  });
}

export type TechnicalLogger = ReturnType<typeof createTechnicalLogger>;
export type UserFacingLogger = ReturnType<typeof createUserFacingLogger>;
