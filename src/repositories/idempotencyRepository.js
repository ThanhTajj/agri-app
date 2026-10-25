import { createHash } from 'node:crypto';
import { HttpError } from '../errors/HttpError.js';

const KEY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_TRANSACTION_ATTEMPTS = 5;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const isRetryableConcurrencyError = (error) => {
  const code = error.original?.code ?? error.parent?.code ?? error.code;
  return (
    error.name === 'SequelizeUniqueConstraintError' ||
    code === 'ER_DUP_ENTRY' ||
    code === 'ER_LOCK_DEADLOCK' ||
    code === 'ER_LOCK_WAIT_TIMEOUT'
  );
};

const createScopeWhere = (scope) => ({
  userHash: sha256(String(scope.userId)),
  endpoint: scope.endpoint,
  keyHash: sha256(scope.key),
});

export const createIdempotencyRepository = ({
  sequelize,
  IdempotencyRequest,
  clock = () => new Date(),
}) => ({
  async run({ scope, payloadHash, operation }) {
    const where = createScopeWhere(scope);

    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      const transaction = await sequelize.transaction({
        isolationLevel: 'READ COMMITTED',
      });

      try {
        const existingRecord = await IdempotencyRequest.findOne({
          where,
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const now = clock();

        if (existingRecord && new Date(existingRecord.expiresAt).getTime() > now.getTime()) {
          if (existingRecord.payloadHash !== payloadHash) {
            throw new HttpError(
              409,
              'IDEMPOTENCY_KEY_REUSED',
              'Idempotency-Key đã được dùng với payload khác.',
            );
          }
          if (existingRecord.responseStatus !== 201 || !existingRecord.responseBody) {
            throw new Error('Idempotency record is missing its committed response.');
          }

          const response = existingRecord.responseBody;
          await transaction.commit();
          return response;
        }

        if (existingRecord) {
          await existingRecord.destroy({ transaction });
        }

        const record = await IdempotencyRequest.create(
          {
            ...where,
            payloadHash,
            responseStatus: null,
            responseBody: null,
            expiresAt: new Date(now.getTime() + KEY_LIFETIME_MS),
            createdAt: now,
          },
          { transaction },
        );
        const response = await operation(transaction);
        const successfulAt = clock();

        await record.update(
          {
            responseStatus: 201,
            responseBody: response,
            expiresAt: new Date(successfulAt.getTime() + KEY_LIFETIME_MS),
          },
          { transaction },
        );
        await transaction.commit();
        return response;
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback();
        }
        if (isRetryableConcurrencyError(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Unable to complete idempotency transaction after concurrency retries.');
  },
});
