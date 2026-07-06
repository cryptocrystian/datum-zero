import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../contracts/work-order.schema.json";

/**
 * Runtime validation against the canonical contract (packages/adapters/contracts/work-order.schema.json).
 * Every outbound payload is validated BEFORE it leaves the system (CR-05, CR-12) — including the
 * recommendation.text verdict-language pattern guard.
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema as unknown as object);

export class WorkOrderValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super("work order failed schema validation: " + errors.join("; "));
    this.name = "WorkOrderValidationError";
  }
}

export function isValidWorkOrder(payload: unknown): boolean {
  return validate(payload) === true;
}

export function validateWorkOrder(payload: unknown): void {
  if (!validate(payload)) {
    const errs = (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
    throw new WorkOrderValidationError(errs);
  }
}
