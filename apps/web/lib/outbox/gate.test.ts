import { describe, it, expect } from "vitest";
import { assertApprovedForDispatch, DispatchGateError, type DispatchGateInput } from "./gate";

const approved: DispatchGateInput = {
  status: "APPROVED_DISPATCHED",
  reviewedById: "00000000-0000-0000-0000-0000000000a1",
  reviewedAt: new Date("2026-07-06T00:00:00Z"),
  spatialBindingStatus: "BOUND",
};

describe("100% QA dispatch gate (CR-12)", () => {
  it("allows a fully approved, bound anomaly", () => {
    expect(() => assertApprovedForDispatch(approved)).not.toThrow();
  });

  it("refuses when there is no reviewer", () => {
    expect(() => assertApprovedForDispatch({ ...approved, reviewedById: null })).toThrow(DispatchGateError);
    expect(() => assertApprovedForDispatch({ ...approved, reviewedAt: null })).toThrow(DispatchGateError);
  });

  it("refuses when status is still PENDING_QA", () => {
    expect(() => assertApprovedForDispatch({ ...approved, status: "PENDING_QA" })).toThrow(DispatchGateError);
  });

  it("refuses when the anomaly is not spatially bound", () => {
    expect(() =>
      assertApprovedForDispatch({ ...approved, spatialBindingStatus: "UNBOUND_REVIEW" }),
    ).toThrow(DispatchGateError);
  });
});
