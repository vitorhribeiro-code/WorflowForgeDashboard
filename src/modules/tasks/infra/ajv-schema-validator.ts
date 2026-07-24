import Ajv from "ajv";
import type { SchemaValidatorPort, ValidationResult } from "../service/ports";

// Impl concreta do SchemaValidatorPort. strict:false para aceitar schemas
// permissivos; allErrors para devolver todas as falhas de dados.
export function createAjvSchemaValidator(): SchemaValidatorPort {
  const ajv = new Ajv({ allErrors: true, strict: false });

  return {
    validateSchema(schema: unknown): ValidationResult {
      try {
        ajv.compile(schema as object); // lança se o schema for inválido
        return { valid: true, errors: [] };
      } catch (err) {
        return { valid: false, errors: [err instanceof Error ? err.message : String(err)] };
      }
    },

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
