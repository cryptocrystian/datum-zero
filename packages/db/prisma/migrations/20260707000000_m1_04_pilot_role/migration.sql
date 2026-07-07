-- M1-04 — add the PILOT role for the Infield Validator PWA (CR-11).
-- Field pilots sign into /field; org derives from the session (RLS-scoped, M1-02).

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PILOT';
