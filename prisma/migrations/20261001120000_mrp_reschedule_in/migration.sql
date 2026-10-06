-- MRP exception for open supply pulled in to cover an earlier need: the PO or
-- work order must be expedited rather than duplicated.
ALTER TYPE "MrpExceptionType" ADD VALUE 'RESCHEDULE_IN';
