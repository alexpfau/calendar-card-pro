/**
 * Core's answers to the visibility conditions only it can judge.
 *
 * Since 2026.10 Home Assistant judges a card's `template`, `sun`, `zone` and `device` conditions,
 * and a state held `for` a while, in core: it subscribes to each with `subscribe_condition`, and
 * core pushes whether it holds whenever that changes. The card asks the same questions for its
 * calendars (`coreConditions` in `utils/visibility.ts` lists them), and this module holds the
 * subscriptions and their answers, one per question however many entries ask it.
 *
 * Three outcomes besides an answer:
 *
 * - core cannot parse a condition, or reports an error judging it: the answer is `error`, and the
 *   entry hides, as Home Assistant hides a card;
 * - Home Assistant does not know the command (before 2026.6) or refuses it to this user (2026.6 to
 *   2026.9 allowed it to administrators only): no answer, ever, so the card judges what it can in
 *   the browser and the rest stays unknown. Said once per connection, and asked again when the
 *   connection comes back, as Home Assistant may have been upgraded;
 * - the connection is down: asked again when it comes back.
 *
 * Unsubscribing follows the rule `close` in `utils/live-calendars.ts` describes for the websocket
 * library Home Assistant shipped up to 2026.10, which sends an unsubscribe made while the
 * connection is down, or after it came back but before the subscription pushed, to the wrong
 * place: it waits for a push in the connection's current life, and core pushes as soon as it
 * subscribes.
 */
import * as Logger from './logger';
import type { CoreAnswer, VisibilityCondition } from './visibility';
import type * as Types from '../config/types';

type Connection = NonNullable<Types.Hass['connection']>;

/** What core pushes for a subscription. */
interface CorePush {
  result?: unknown;
  error?: unknown;
}

/** One question to core, and what it answered. */
interface Question {
  readonly key: string;
  answer: CoreAnswer | undefined;
  /** Not sent: Home Assistant refused the command, or the connection was down. */
  refused: boolean;
  /** Set once no entry asks it any more; it is unsubscribed as soon as that is safe. */
  closed: boolean;
  /** The life of the connection (`ConnectionLife.epoch`) in which it last pushed, or -1. */
  pushedIn: number;
  unsubscribe: Promise<(() => void) | null>;
}

/** What every card shares about one connection. */
interface ConnectionLife {
  /** How many times it has come back. */
  epoch: number;
  /** Whether it takes `subscribe_condition`, as far as is known. */
  support: 'unknown' | 'yes' | 'no';
  /** Whether a refusal was reported already. */
  warned: boolean;
  /** What to tell when it comes back. */
  readonly listeners: Set<() => void>;
}

const lives = new WeakMap<object, ConnectionLife>();

/**
 * What is known about a connection, made on first use.
 *
 * @param connection - Home Assistant's connection
 * @returns Its record
 */
function lifeOf(connection: Connection): ConnectionLife {
  let life = lives.get(connection);
  if (life) return life;
  const created: ConnectionLife = {
    epoch: 0,
    support: 'unknown',
    warned: false,
    listeners: new Set(),
  };
  lives.set(connection, created);
  connection.addEventListener?.('ready', () => {
    created.epoch += 1;
    if (created.support === 'no') created.support = 'unknown';
    for (const listener of [...created.listeners]) listener();
  });
  life = created;
  return life;
}

/**
 * The subscribable connection of a `hass`, or null where there is none.
 *
 * @param hass - Home Assistant
 * @returns The connection
 */
function connectionOf(hass: Types.Hass | null | undefined): Connection | null {
  const connection = hass?.connection;
  return connection && typeof connection.subscribeMessage === 'function' ? connection : null;
}

/** Home Assistant's answers for a command it does not know, or will not run for this user. */
const REFUSALS = new Set(['unknown_command', 'unauthorized']);

/** One card's questions to core. */
export class CoreConditions {
  private connection: Connection | null = null;

  private readonly questions = new Map<string, Question>();

  private readonly onReady = (): void => this._retryRefused();

  /**
   * @param changed - Called when an answer changes, or a refused question can be asked again
   */
  constructor(private readonly changed: () => void) {}

  /**
   * What core answered a question, on the connection `hass` holds. An answer from a connection
   * Home Assistant has since replaced is no answer: the update judging with it runs before the
   * next sync can ask the new connection, and must not show what the old one said.
   *
   * @param key - Its key (`coreConditions`)
   * @param hass - The `hass` the card judges with
   * @returns The answer, or undefined while there is none
   */
  answer(key: string, hass: Types.Hass | null | undefined): CoreAnswer | undefined {
    if (connectionOf(hass) !== this.connection) return undefined;
    return this.questions.get(key)?.answer;
  }

  /**
   * Asks exactly these questions: those not asked yet are asked, those no longer wanted are
   * closed. A new connection asks everything again.
   *
   * @param hass - Home Assistant
   * @param wanted - The questions, by key (`entriesCoreConditions`)
   */
  sync(
    hass: Types.Hass | null | undefined,
    wanted: ReadonlyMap<string, VisibilityCondition>,
  ): void {
    const connection = wanted.size > 0 ? connectionOf(hass) : this.connection;
    if (connection !== this.connection) {
      this.stop();
      this.connection = connection;
      if (connection) lifeOf(connection).listeners.add(this.onReady);
    }
    if (!connection) return;

    for (const question of [...this.questions.values()]) {
      if (!wanted.has(question.key)) this._close(question);
    }
    for (const [key, condition] of wanted) {
      if (!this.questions.has(key)) this._ask(connection, key, condition);
    }
  }

  /** Closes every question and forgets the connection, as the card detaches. */
  stop(): void {
    for (const question of [...this.questions.values()]) this._close(question);
    if (this.connection) lifeOf(this.connection).listeners.delete(this.onReady);
    this.connection = null;
  }

  private _ask(connection: Connection, key: string, condition: VisibilityCondition): void {
    const life = lifeOf(connection);
    const question: Question = {
      key,
      answer: undefined,
      refused: false,
      closed: false,
      pushedIn: -1,
      unsubscribe: Promise.resolve(null),
    };
    this.questions.set(key, question);
    if (life.support === 'no' || connection.connected === false) {
      question.refused = true;
      return;
    }

    question.unsubscribe = connection
      .subscribeMessage<CorePush>((push) => this._receive(question, life, push), {
        type: 'subscribe_condition',
        condition,
      })
      .then(
        (unsubscribe) => {
          life.support = 'yes';
          return (): void => {
            void Promise.resolve()
              .then(unsubscribe)
              .catch(() => undefined);
          };
        },
        (error: { code?: unknown; message?: unknown } | undefined) => {
          const code = typeof error?.code === 'string' ? error.code : undefined;
          if (code !== undefined && REFUSALS.has(code)) {
            life.support = 'no';
            question.refused = true;
            if (!life.warned) {
              life.warned = true;
              Logger.warn(
                `Visibility: Home Assistant does not judge conditions for this card (${code}). ` +
                  'Calendars whose conditions only it can judge (template, sun, zone, device, a ' +
                  'state held for a while) stay hidden; that needs Home Assistant 2026.10.',
              );
            }
            return null;
          }
          life.support = 'yes';
          Logger.warn(
            `Visibility: Home Assistant cannot judge ${JSON.stringify(condition)}: ` +
              `${String(error?.message ?? code ?? 'no reason given')}. Its calendar stays hidden.`,
          );
          if (!question.closed) {
            question.answer = 'error';
            this.changed();
          }
          return null;
        },
      );
  }

  private _receive(question: Question, life: ConnectionLife, push: CorePush): void {
    question.pushedIn = life.epoch;
    if (question.closed) {
      // The unsubscribe `_close` could not send safely; this push shows it now can.
      void question.unsubscribe.then((unsubscribe) => unsubscribe?.());
      return;
    }
    let answer: CoreAnswer | undefined;
    // `null` is core's answer for a condition a templated `enabled` switched off.
    if (typeof push?.result === 'boolean' || push?.result === null) {
      answer = push.result;
    } else if (push?.error !== undefined) {
      answer = 'error';
      if (question.answer !== 'error') {
        Logger.warn(`Visibility: Home Assistant reports ${String(push.error)} judging a condition`);
      }
    }
    if (answer === undefined || answer === question.answer) return;
    question.answer = answer;
    this.changed();
  }

  private _close(question: Question): void {
    if (question.closed) return;
    question.closed = true;
    this.questions.delete(question.key);
    const connection = this.connection;
    if (question.refused || !connection) return;
    if (connection.connected !== false && question.pushedIn === lifeOf(connection).epoch) {
      void question.unsubscribe.then((unsubscribe) => unsubscribe?.());
    }
  }

  /** Forgets what was refused, so the next sync asks it again, now the connection is back. */
  private _retryRefused(): void {
    let retried = false;
    for (const question of [...this.questions.values()]) {
      if (!question.refused) continue;
      this.questions.delete(question.key);
      retried = true;
    }
    if (retried) this.changed();
  }
}
