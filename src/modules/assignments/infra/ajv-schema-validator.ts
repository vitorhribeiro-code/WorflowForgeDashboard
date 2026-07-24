import Ajv from "ajv";
import type { SchemaValidatorPort, ValidationResult } from "../service/ports";

// Validador de dados contra JSON Schema (mesma base do M4). Reutilizado no M5
// para validar a config das Assignments contra o config_schema da Task.
export function createAjvSchemaValidator(): SchemaValidatorPort {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return {
    validateData(schema: unknown, data: unknown): ValidationResult {
      let validate;
      try {
        validate = ajv.compile(schema as object);
      } catch (err) {
        return { valid: false, errors: [err instanceof Error ? err.message : String(err)] };
      }
      const ok = validate(data);
      const errors = (validate.errors ?? []).map(
        (e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim(),
      );
      return { valid: Boolean(ok), errors };
    },
  };
}
