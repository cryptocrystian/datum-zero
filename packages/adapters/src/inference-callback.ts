import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../contracts/inference-callback.schema.json";

/**
 * Runtime validation of the INBOUND inference→web callback payload against the canonical contract
 * (packages/adapters/contracts/inference-callback.schema.json). The Python pipeline emits it and the
 * Next.js callback reads it by field name with no code-level edge between them — so both sides
 * validate against this one schema, and the callback fails closed on any payload that does not match.
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema as unknown as object);

export class InferenceCallbackValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super("inference callback payload failed schema validation: " + errors.join("; "));
    this.name = "InferenceCallbackValidationError";
  }
}

export function isValidInferenceCallback(payload: unknown): boolean {
  return validate(payload) === true;
}

export function validateInferenceCallback(payload: unknown): void {
  if (!validate(payload)) {
    const errs = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
    throw new InferenceCallbackValidationError(errs);
  }
}
